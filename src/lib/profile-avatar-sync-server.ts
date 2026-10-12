import { createHash } from "crypto";
import { FieldPath, FieldValue, type DocumentData } from "firebase-admin/firestore";
import { getAdminDb } from "./firebase-admin";

const JOBS = "profileAvatarSyncJobs";
const PAGE_SIZE = 100;
// Include the legacy userId field without taking ownership from a canonical owner.
const SOURCES = [
  { collection: "listings", ownerField: "authorId", avatarField: "authorAvatarUrl", kind: "listing" },
  { collection: "listings", ownerField: "userId", avatarField: "authorAvatarUrl", kind: "listing" },
  { collection: "customerRequests", ownerField: "customerId", avatarField: "customerAvatar", kind: "request" },
  { collection: "customerRequests", ownerField: "userId", avatarField: "customerAvatar", kind: "request" },
] as const;

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function currentProfileAvatar(data: DocumentData) {
  // An explicitly empty avatar is authoritative (avatar removal).
  const value = typeof data.avatarUrl === "string" ? data.avatarUrl : data.photoURL;
  const avatar = safeString(value);
  if (!avatar) return "";
  try {
    const url = new URL(avatar);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString() : "";
  } catch {
    return "";
  }
}

function avatarVersion(avatar: string) {
  return createHash("sha256").update(avatar).digest("hex").slice(0, 24);
}

function ownerId(data: DocumentData, kind: "listing" | "request") {
  return safeString(kind === "listing" ? data.authorId : data.customerId)
    || safeString(data.userId);
}

export function avatarPublicationPatch(
  data: DocumentData,
  uid: string,
  kind: "listing" | "request",
  avatar: string,
  version: string
): DocumentData | null {
  if (ownerId(data, kind) !== uid) return null;
  const field = kind === "listing" ? "authorAvatarUrl" : "customerAvatar";
  if (data[field] === avatar && data.profileAvatarVersion === version) return null;
  return { [field]: avatar, profileAvatarVersion: version };
}

/**
 * Creates a durable job from the saved profile, never from client-supplied
 * avatar/owner fields. Repeated requests for the same avatar are idempotent.
 */
export async function queueProfileAvatarSync(uid: string) {
  const db = getAdminDb();
  const profileRef = db.collection("users").doc(uid);
  const jobRef = db.collection(JOBS).doc(uid);
  return db.runTransaction(async transaction => {
    const [profile, job] = await Promise.all([
      transaction.get(profileRef), transaction.get(jobRef),
    ]);
    if (!profile.exists) throw new Error("Профиль не найден.");
    const avatar = currentProfileAvatar(profile.data() || {});
    const version = avatarVersion(avatar);
    const old = job.data() || {};
    if (old.version === version) return Boolean(old.pending);
    transaction.set(jobRef, {
      uid, version, pending: true, sourceIndex: 0, cursor: "", updatedCount: 0,
      queuedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

/**
 * Each page is transactional with the current profile. If the user changes
 * the avatar twice, an older worker cannot overwrite the newer avatar.
 * Only avatar fields are touched; moderation, dates and photos stay intact.
 */
export async function syncProfileAvatar(uid: string, maxPages = 8) {
  const db = getAdminDb();
  const profileRef = db.collection("users").doc(uid);
  const jobRef = db.collection(JOBS).doc(uid);
  let updated = 0;
  for (let page = 0; page < maxPages; page++) {
    const result = await db.runTransaction(async transaction => {
      const [profile, job] = await Promise.all([
        transaction.get(profileRef), transaction.get(jobRef),
      ]);
      if (!profile.exists || !job.exists) return { pending: false, updated: 0 };
      const state = job.data() || {};
      const avatar = currentProfileAvatar(profile.data() || {});
      const version = avatarVersion(avatar);
      const changed = version !== state.version;
      if (!changed && !state.pending) return { pending: false, updated: 0 };

      const sourceIndex = changed ? 0 : Math.max(0, Number(state.sourceIndex) || 0);
      const source = SOURCES[sourceIndex];
      if (!source) {
        transaction.update(jobRef, { pending: false });
        return { pending: false, updated: 0 };
      }
      let publications = db.collection(source.collection)
        .where(source.ownerField, "==", uid)
        .orderBy(FieldPath.documentId())
        .limit(PAGE_SIZE);
      const cursor = changed ? "" : safeString(state.cursor);
      if (cursor) publications = publications.startAfter(cursor);
      const snapshot = await transaction.get(publications);
      let count = 0;
      snapshot.docs.forEach(document => {
        const patch = avatarPublicationPatch(document.data(), uid, source.kind, avatar, version);
        if (!patch) return;
        transaction.update(document.ref, patch);
        count++;
      });
      const sourceDone = snapshot.size < PAGE_SIZE;
      const nextSource = sourceDone ? sourceIndex + 1 : sourceIndex;
      const pending = nextSource < SOURCES.length;
      transaction.set(jobRef, {
        uid, version, pending, sourceIndex: nextSource,
        cursor: sourceDone ? "" : snapshot.docs[snapshot.size - 1].id,
        updatedCount: (changed ? 0 : Number(state.updatedCount) || 0) + count,
        processedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { pending, updated: count };
    });
    updated += result.updated;
    if (!result.pending) return { pending: false, updated };
  }
  return { pending: true, updated };
}

export async function runProfileAvatarSyncBatch(limit = 10) {
  const jobs = await getAdminDb().collection(JOBS).where("pending", "==", true)
    .limit(Math.max(1, Math.min(20, limit))).get();
  let updated = 0;
  for (const job of jobs.docs) {
    try {
      updated += (await syncProfileAvatar(job.id, 4)).updated;
    } catch (error) {
      // The cursor remains durable and will be retried on the next scheduler tick.
      console.error("profile avatar sync failed", job.id, error);
    }
  }
  return { jobs: jobs.size, updated };
}

