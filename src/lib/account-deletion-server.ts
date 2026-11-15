import { createHash, randomUUID } from 'node:crypto';
import { FieldPath, FieldValue, Timestamp, type Firestore, type DocumentReference } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import { getAdminDb, getRawAdminAuth } from './firebase-admin';
import { accountMediaKey, mediaId, mediaKeys, purgeAccountMedia } from './account-deletion-media';
import { DELETION_ROOTS, deletionPlan, emptyEntities, type DeletedEntities } from './account-deletion-policy';
import { purgeVerificationFile } from './verification-files-server';

export const DELETION_PROTOCOL = '1';
const PAGE = 35, LEASE_MS = 10 * 60_000;
// Keep the Firestore revocation guard until all previously issued ID tokens expire.
export const TOKEN_DRAIN_MS = 65 * 60_000;
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
export const validDeletionReceipt = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9]{40}$/.test(v);
type Dependencies = { db: Firestore; auth: Auth; purgeMedia: (key: string) => Promise<void>; purgePrivate: (id: string) => Promise<void>; now: () => number };
const defaults = (): Dependencies => ({ db: getAdminDb(), auth: getRawAdminAuth(), purgeMedia: purgeAccountMedia, purgePrivate: purgeVerificationFile, now: Date.now });

export async function queueAccountDeletion(uid: string, receipt: string, deps = defaults()) {
  if (!validDeletionReceipt(receipt) || !uid || uid.includes('/')) throw new Error('deletion/invalid-request');
  const { db, now } = deps, job = db.doc(`accountDeletionJobs/${uid}`), proof = db.doc(`accountDeletionReceipts/${hash(receipt)}`);
  const account = await deps.auth.getUser(uid);
  const limitKeys = ['manage:' + uid, 'deletion:' + uid, ...(account.email ? ['password:' + account.email.trim().toLowerCase()] : [])].map(hash);
  await db.runTransaction(async tx => {
    const [previous, existingProof] = await Promise.all([tx.get(job), tx.get(proof)]);
    if (previous.exists) {
      if (previous.get('receiptHash') !== hash(receipt)) throw new Error('deletion/already-requested');
      return;
    }
    if (existingProof.exists) throw new Error('deletion/receipt-used');
    tx.create(job, { uid, receiptHash: hash(receipt), limitKeys, stage: 'disable', pass: 0, nextAttemptAt: Timestamp.fromMillis(now()), failures: 0 });
    tx.set(db.doc(`authRevocations/${uid}`), { validAfter: 253402300799 });
    tx.create(proof, { status: 'pending', createdAt: Timestamp.fromMillis(now()) });
  });
  return { status: 'pending' as const, receipt };
}
export async function deletionStatus(receipt: string, db = getAdminDb()) {
  if (!validDeletionReceipt(receipt)) return null;
  const saved = await db.doc(`accountDeletionReceipts/${hash(receipt)}`).get();
  if (!saved.exists) return null;
  return { status: saved.get('status') as 'pending' | 'retrying' | 'completed', retryAfter: 15 };
}
async function seedScans(job: DocumentReference, uid: string, db: Firestore) {
  const batch = db.batch();
  DELETION_ROOTS.forEach((path, index) => batch.set(job.collection('tasks').doc(hash(path)), { path, erase: false, cursor: '', order: index }));
  ['messages', 'offers', 'notifications', 'favorites', 'blocked', 'events'].forEach((path, index) => batch.set(job.collection('tasks').doc(hash(`group:${path}`)), { path, group: true, erase: false, cursor: '', order: 100 + index }));
  for (const parent of ['users', 'availability', 'accountSecurity', 'freePlacementAccounts', 'billingAccounts']) {
    for (const child of await db.doc(`${parent}/${uid}`).listCollections()) batch.set(job.collection('tasks').doc(hash(child.path)), { path: child.path, erase: true, cursor: '', order: -1 });
  }
  await batch.commit();
}
async function entitiesFor(job: DocumentReference): Promise<DeletedEntities> {
  const entities = emptyEntities();
  for (const doc of (await job.collection('entities').get()).docs) {
    const kind = doc.get('kind') as keyof DeletedEntities;
    if (Object.hasOwn(entities, kind)) entities[kind].add(doc.get('id'));
  }
  return entities;
}
function entityFor(path: string): keyof DeletedEntities | null {
  const p = path.split('/');
  return p.length === 2 ? ({ listings: 'listings', customerRequests: 'requests', reviews: 'reviews', chats: 'chats' } as Record<string, keyof DeletedEntities>)[p[0]] || null : null;
}
async function scanPage(job: DocumentReference, task: DocumentReference, uid: string, deps: Dependencies) {
  const { db } = deps, saved = (await task.get()).data(); if (!saved) return;
  const entities = await entitiesFor(job);
  let query = (saved.group ? db.collectionGroup(saved.path) : db.collection(saved.path)).orderBy(FieldPath.documentId()).limit(PAGE);
  if (saved.cursor) query = query.startAfter(saved.group ? db.doc(saved.cursor) : saved.cursor);
  const page = await query.get(); if (page.empty) { await task.delete(); return; }
  for (const doc of page.docs) {
    const data = doc.data(), plan = saved.erase ? { remove: true } : deletionPlan(doc.ref.path, data, uid, entities);
    const value = plan.value || data, batch = db.batch();
    // Do not traverse collection-group results twice. The fallback handles orphan documents.
    if (!saved.group || plan.remove) for (const child of await doc.ref.listCollections()) batch.set(job.collection('tasks').doc(hash(child.path)), { path: child.path, erase: plan.remove, cursor: '', order: saved.order - 0.01 });
    const kind = plan.remove ? entityFor(doc.ref.path) : null;
    if (kind) {
      batch.set(job.collection('entities').doc(hash(doc.ref.path)), { kind, id: doc.id }); entities[kind].add(doc.id);
      const analytics = kind === 'listings' ? 'listingAnalytics' : kind === 'requests' ? 'requestAnalytics' : '';
      if (analytics) {
        const ref = db.doc(`${analytics}/${doc.id}`);
        for (const child of await ref.listCollections()) batch.set(job.collection('tasks').doc(hash(child.path)), { path: child.path, erase: true, cursor: '', order: saved.order - 0.01 });
        batch.delete(ref);
      }
    }
    // Save keys in the same commit as deletion of the source document.
    if (doc.ref.parent.id !== 'accountMedia') {
      const after = plan.remove ? new Set<string>() : mediaKeys(value);
      for (const key of mediaKeys(data)) batch.set(job.collection('media').doc(mediaId(key)), { key, ...(after.has(key) ? { retained: true } : { candidate: true }) }, { merge: true });
    }
    if (plan.remove && doc.ref.parent.id === 'accountMedia' && data.ownerUid === uid && accountMediaKey(data.key)) batch.set(job.collection('media').doc(mediaId(data.key)), { key: data.key, candidate: true, owned: true }, { merge: true });
    if (plan.remove && doc.ref.parent.id === 'verificationAttachments') batch.set(job.collection('privateFiles').doc(doc.id), { id: doc.id });
    if (plan.remove && doc.ref.parent.id === 'reviews') {
      for (const [collection, id] of [['listings', data.listingId], ['users', data.targetUserId || data.listingAuthorId]]) if (typeof id === 'string' && id && !id.includes('/')) batch.set(job.collection('ratings').doc(hash(`${collection}/${id}`)), { collection, id });
    }
    if (plan.remove) batch.delete(doc.ref, { lastUpdateTime: doc.updateTime });
    else if (plan.value && JSON.stringify(value) !== JSON.stringify(data)) {
      const patch = { ...value }; for (const key of Object.keys(data)) if (!(key in value)) patch[key] = FieldValue.delete();
      batch.update(doc.ref, patch, { lastUpdateTime: doc.updateTime });
    }
    batch.update(task, { cursor: saved.group ? doc.ref.path : doc.id });
    await batch.commit();
  }
}
async function recalculateRating(job: DocumentReference, { db }: Dependencies) {
  const task = (await job.collection('ratings').limit(1).get()).docs[0]; if (!task) return false;
  const { collection, id } = task.data(), field = collection === 'listings' ? 'listingId' : 'targetUserId';
  await db.runTransaction(async tx => {
    const target = db.doc(`${collection}/${id}`), existing = await tx.get(target);
    if (existing.exists) {
      const reviews = await tx.get(db.collection('reviews').where(field, '==', id));
      const values = reviews.docs.map(d => d.data()).filter(d => d.moderationStatus === 'approved' || collection === 'listings' && !d.moderationStatus).map(d => Number(d.rating)).filter(n => n >= 1 && n <= 5);
      const ratingAverage = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10 : 0;
      tx.update(target, { ratingAverage, ...(collection === 'listings' ? { averageRating: ratingAverage } : {}), reviewsCount: values.length });
    }
    tx.delete(task.ref);
  });
  return true;
}
export async function processAccountDeletion(uid: string, budgetMs = 20_000, deps = defaults()) {
  const { db, auth, now } = deps, job = db.doc(`accountDeletionJobs/${uid}`), token = randomUUID();
  const claimed = await db.runTransaction(async tx => {
    const current = await tx.get(job);
    if (!current.exists || (current.get('leaseUntil')?.toMillis() || 0) > now() || current.get('nextAttemptAt')?.toMillis() > now()) return false;
    tx.update(job, { lease: token, leaseUntil: Timestamp.fromMillis(now() + LEASE_MS) }); return true;
  });
  if (!claimed) return;
  const deadline = Date.now() + Math.max(1, budgetMs);
  try {
    do {
      const state = (await job.get()).data(); if (!state || state.lease !== token) return;
      await job.update({ leaseUntil: Timestamp.fromMillis(now() + LEASE_MS) });
      const proof = db.doc(`accountDeletionReceipts/${state.receiptHash}`);
      if (state.stage === 'disable') {
        try { await auth.updateUser(uid, { disabled: true }); await auth.revokeRefreshTokens(uid); }
        catch (error) { if ((error as { code?: string }).code !== 'auth/user-not-found') throw error; }
        await seedScans(job, uid, db);
        await job.update({ stage: 'scan', drainUntil: Timestamp.fromMillis(now() + TOKEN_DRAIN_MS), pass: 0 });
      } else if (state.stage === 'scan') {
        const task = (await job.collection('tasks').orderBy('order').limit(1).get()).docs[0];
        if (task) await scanPage(job, task.ref, uid, deps);
        else await job.update({ stage: state.pass === 0 ? 'drain' : 'files' });
      } else if (state.stage === 'drain') {
        if (state.drainUntil.toMillis() > now()) { await job.update({ nextAttemptAt: state.drainUntil }); break; }
        // Rescan after in-flight requests and old tokens have drained. Keep file manifests until then.
        await seedScans(job, uid, db); await job.update({ stage: 'scan', pass: 1 });
      } else if (state.stage === 'files') {
        const item = (await job.collection('media').limit(1).get()).docs[0];
        if (item) {
          const file = item.data();
          if (file.candidate && (file.owned || !file.retained)) {
            const registry = await db.doc(`accountMedia/${item.id}`).get();
            if (!registry.exists || registry.get('ownerUid') === uid) await deps.purgeMedia(file.key);
          }
          await item.ref.delete();
        } else {
          const privateFile = (await job.collection('privateFiles').limit(1).get()).docs[0];
          if (privateFile) { await deps.purgePrivate(privateFile.id); await privateFile.ref.delete(); }
          else if (!await recalculateRating(job, deps)) await job.update({ stage: 'finalize' });
        }
      } else if (state.stage === 'finalize') {
        try { await auth.deleteUser(uid); } catch (error) { if ((error as { code?: string }).code !== 'auth/user-not-found') throw error; }
        for (const root of ['users', 'accountSecurity', 'availability']) await db.recursiveDelete(db.doc(`${root}/${uid}`));
        for (const collection of ['tasks', 'entities', 'ratings', 'media', 'privateFiles']) await db.recursiveDelete(job.collection(collection));
        await db.runTransaction(async tx => {
          const current = await tx.get(job); if (current.get('lease') !== token) throw new Error('deletion/lease-lost');
          for (const id of state.limitKeys || []) tx.delete(db.doc(`accountSecurityLimits/${id}`));
          tx.delete(db.doc(`authRevocations/${uid}`));
          tx.set(proof, { status: 'completed', completedAt: Timestamp.fromMillis(now()), expiresAt: Timestamp.fromMillis(now() + 7 * 86400_000) }); tx.delete(job);
        }); return;
      } else throw new Error('deletion/invalid-stage');
      if (state.failures) await proof.update({ status: 'pending' });
    } while (Date.now() < deadline);
  } catch (error) {
    const state = (await job.get()).data();
    if (state?.lease === token) {
      const failures = Number(state.failures || 0) + 1;
      const batch = db.batch();
      batch.update(job, { failures, nextAttemptAt: Timestamp.fromMillis(now() + Math.min(30 * 60_000, 15_000 * 2 ** Math.min(failures, 7))) });
      batch.update(db.doc(`accountDeletionReceipts/${state.receiptHash}`), { status: 'retrying' });
      await batch.commit();
    }
    console.error('Account deletion will retry', { code: String((error as { code?: string }).code || 'cleanup-unavailable').slice(0, 60) });
  } finally {
    await db.runTransaction(async tx => {
      const current = await tx.get(job);
      if (current.exists && current.get('lease') === token) tx.update(job, { lease: FieldValue.delete(), leaseUntil: FieldValue.delete() });
    });
  }
}
export async function runAccountDeletionBatch() {
  const deps = defaults(), { db, now } = deps;
  const jobs = await db.collection('accountDeletionJobs').where('nextAttemptAt', '<=', Timestamp.fromMillis(now())).orderBy('nextAttemptAt').limit(3).get();
  for (const job of jobs.docs) await processAccountDeletion(job.id, 10_000, deps);
  const expired = await db.collection('accountDeletionReceipts').where('expiresAt', '<=', Timestamp.fromMillis(now())).limit(100).get();
  if (!expired.empty) { const batch = db.batch(); expired.docs.forEach(d => batch.delete(d.ref)); await batch.commit(); }
}
