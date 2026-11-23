import { createHash, randomUUID } from "node:crypto";
import { FieldPath, FieldValue, Timestamp, type DocumentData } from "@/lib/database/admin-values";
import { getAdminDb, getRawAdminAuth } from "./firebase-admin";
import { hasModeratorClaim } from "./security-policy";
import { deliverServerNotification } from "./server-notifications";
import { reviewRevision } from "./notification-push-server";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const sources = ["verificationRequests", "listings", "customerRequests"] as const;

/** Firebase custom claims are authoritative. Editable profile roles are ignored. */
export async function syncModeratorRecipients() {
  const db = getAdminDb(), ref = db.doc("jobLeases/moderatorDirectory"), token = randomUUID(), now = Date.now();
  const cursor = await db.runTransaction(async tx => {
    const saved = await tx.get(ref);
    if (Number(saved.get("until") || 0) > now || Number(saved.get("nextScanAt") || 0) > now) return null;
    tx.set(ref, { token, cursor: saved.get("cursor") || "", until: now + 60_000 }, { merge: true });
    return String(saved.get("cursor") || "");
  });
  if (cursor === null) return;
  try {
    const page = await getRawAdminAuth().listUsers(200, cursor || undefined), batch = db.batch();
    const existing = new Set((await db.collection("moderatorRecipients").get()).docs.map(item => item.id));
    for (const account of page.users) {
      const recipient = db.doc(`moderatorRecipients/${account.uid}`);
      if (!account.disabled && hasModeratorClaim(account.customClaims || {})) {
        if (!existing.has(account.uid)) batch.set(recipient, { uid: account.uid, updatedAt: FieldValue.serverTimestamp() });
      } else if (existing.has(account.uid)) batch.delete(recipient);
    }
    batch.set(ref, { token, cursor: page.pageToken || "", until: 0, nextScanAt: page.pageToken ? 0 : now + 300_000 });
    await batch.commit();
  } catch (error) {
    await ref.set({ until: 0, nextScanAt: now + 30_000 }, { merge: true });
    throw error;
  }
}

async function discoverReviewJobs() {
  const db = getAdminDb();
  for (const collection of sources) {
    const verification = collection === "verificationRequests", cursorRef = db.doc(`jobLeases/moderator-scan-${collection}`);
    const saved = await cursorRef.get(), cursor = String(saved.get("cursor") || "");
    let query = db.collection(collection).where(verification ? "status" : "moderationStatus", "==", verification ? "pending" : "manual_review").orderBy(FieldPath.documentId()).limit(20);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    for (const item of page.docs) {
      if (verification && item.get("source") === "web-registration" && Number(item.get("schemaVersion") || 0) < 2) continue;
      const revision = reviewRevision(item.data(), verification);
      const job = db.doc(`moderatorNotificationJobs/${hash(`${collection}:${item.id}:${revision}`)}`);
      await db.runTransaction(async tx => {
        const [current, existing] = await Promise.all([tx.get(item.ref), tx.get(job)]);
        if (existing.exists || !current.exists || current.get(verification ? "status" : "moderationStatus") !== (verification ? "pending" : "manual_review") || reviewRevision(current.data()!, verification) !== revision) return;
        tx.create(job, { collection, entityId: item.id, revision, ownerUid: item.get(verification ? "userId" : collection === "customerRequests" ? "customerId" : "authorId") || "",
          deliveredTo: [], createdAt: FieldValue.serverTimestamp(), nextAttemptAt: Timestamp.now() });
      });
    }
    const nextCursor = page.size === 20 ? page.docs.at(-1)!.id : "";
    if (nextCursor !== cursor) await cursorRef.set({ cursor: nextCursor });
  }
}

function notificationText(collection: string, data: DocumentData) {
  if (collection === "verificationRequests") {
    const label = data.accountType === "ooo" ? "ООО" : data.accountType === "ip" ? "ИП" : "физлица";
    return { title: "🛡️ Заявка на проверку аккаунта", body: `Пришли документы ${label}, можно посмотреть и принять решение`, url: "/moderator/verification", type: "moderator_verification" };
  }
  return { title: collection === "reviews" ? "🛡️ Отзыв ждёт проверки" : "🛡️ Объявление ждёт проверки",
    body: `ИИ передал на ручную проверку${data.title ? ` «${String(data.title).slice(0, 100)}»` : ", нужно решение модератора"}`,
    url: "/moderator/reports?status=manual_review", type: "moderator_publication" };
}

export async function runModeratorNotificationBatch() {
  await syncModeratorRecipients();
  const db = getAdminDb(), leaseRef = db.doc("jobLeases/moderatorNotifications"), token = randomUUID(), now = Date.now();
  const claimed = await db.runTransaction(async tx => {
    const saved = await tx.get(leaseRef);
    if (Number(saved.get("until") || 0) > now) return false;
    tx.set(leaseRef, { token, until: now + 90_000 }); return true;
  });
  if (!claimed) return;
  try {
    await discoverReviewJobs();
    const directory = await db.collection("moderatorRecipients").get();
    const recipients: string[] = [];
    for (const entry of directory.docs) {
      try {
        const account = await getRawAdminAuth().getUser(entry.id);
        if (!account.disabled && hasModeratorClaim(account.customClaims || {})) recipients.push(entry.id);
        else await entry.ref.delete();
      } catch (error) { if ((error as { code?: string }).code === "auth/user-not-found") await entry.ref.delete(); else throw error; }
    }
    const jobs = await db.collection("moderatorNotificationJobs").where("nextAttemptAt", "<=", Timestamp.now()).orderBy("nextAttemptAt").limit(15).get();
    for (const job of jobs.docs) {
      if (Date.now() - now > 60_000) break;
      const data = job.data();
      if (!sources.includes(data.collection) || !data.entityId || String(data.entityId).includes("/")) { await job.ref.update({ completed: true, nextAttemptAt: FieldValue.delete() }); continue; }
      const source = db.doc(`${data.collection}/${data.entityId}`), current = await source.get(), verification = data.collection === "verificationRequests";
      const pending = (value: DocumentData | undefined) => value && value[verification ? "status" : "moderationStatus"] === (verification ? "pending" : "manual_review") && reviewRevision(value, verification) === data.revision;
      if (!pending(current.data())) { await job.ref.update({ completed: true, nextAttemptAt: FieldValue.delete() }); continue; }
      if (!recipients.length) { await job.ref.update({ nextAttemptAt: Timestamp.fromMillis(Date.now() + 60_000) }); continue; }
      const done = new Set<string>(data.deliveredTo || []);
      for (const uid of recipients) {
        if (done.has(uid)) continue;
        const result = await deliverServerNotification({ ...notificationText(data.collection, current.data()!), recipientId: uid, actorId: "system", entityId: data.entityId,
          durableDedupe: true, dedupeKey: `moderator:${job.id}`,
          reviewTarget: { collection: data.collection, id: data.entityId, revision: data.revision } }, async tx => {
          const latest = await tx.get(source);
          const deletion = data.ownerUid ? await tx.get(db.doc(`accountDeletionJobs/${data.ownerUid}`)) : null;
          return Boolean(pending(latest.data()) && !deletion?.exists);
        });
        if (!result.ok) throw new Error("moderator/notification-unavailable");
        done.add(uid);
        await job.ref.update({ deliveredTo: [...done] });
      }
      await job.ref.update({ completed: true, nextAttemptAt: FieldValue.delete(), completedAt: FieldValue.serverTimestamp() });
    }
  } finally {
    await db.runTransaction(async tx => {
      const saved = await tx.get(leaseRef);
      if (saved.get("token") === token) tx.update(leaseRef, { until: 0 });
    });
  }
}
