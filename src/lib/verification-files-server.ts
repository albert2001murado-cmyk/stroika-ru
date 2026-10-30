import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";
import { getAdminDb } from "./firebase-admin";
import { hasModeratorClaim, isDocumentId } from "./security-policy";
import { VerificationError } from "./verification-errors";
import {
  VERIFICATION_FILE_LIMIT,
  VERIFICATION_RETRY_MS,
  verificationAccountType,
  type VerificationAttachment,
  type VerificationAttachmentKind,
} from "./accountVerification";

const privateRoot = () =>
  path.resolve(
    process.env.VERIFICATION_DOCUMENTS_DIR ||
      path.join(process.cwd(), "..", "strova-private", "verification"),
  );
export const isVerificationFileId = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    id,
  );
const kinds = ["registration", "authority", "portfolio"];

export function verificationAttachmentView(
  id: string,
  data: DocumentData,
): VerificationAttachment {
  return {
    id,
    name: String(data.name || "Документ").slice(0, 180),
    contentType: String(data.contentType || "application/octet-stream"),
    size: Number(data.size || 0),
    kind: data.kind as VerificationAttachmentKind,
  };
}
export function verificationRetryAt(data?: DocumentData): number {
  if (
    data?.source === "web-registration" &&
    Number(data.schemaVersion || 0) < 2
  )
    return 0;
  const reviewed =
    typeof data?.reviewedAt?.toMillis === "function"
      ? data.reviewedAt.toMillis()
      : Number(data?.reviewedAt || 0);
  return data?.status === "rejected" && reviewed > 0
    ? reviewed + VERIFICATION_RETRY_MS
    : 0;
}
export async function saveVerificationAttachment(
  uid: string,
  file: File,
  kind: string,
) {
  if (!kinds.includes(kind))
    throw new VerificationError("Выберите назначение файла.");
  if (!file.size || file.size > VERIFICATION_FILE_LIMIT)
    throw new VerificationError("Файл должен быть не больше 10 МБ.", 413);
  const db = getAdminDb(),
    profile = await db.doc(`users/${uid}`).get();
  if (!profile.exists || profile.get("moderationStatus") === "blocked")
    throw new VerificationError("Аккаунту недоступна загрузка.", 403);
  const individual =
    verificationAccountType(profile.get("accountType")) === "individual";
  if (individual ? kind !== "portfolio" : kind === "portfolio")
    throw new VerificationError("Этот файл не подходит для типа аккаунта.");
  const requestId = profile.get("verificationRequestId");
  if (typeof requestId === "string" && isDocumentId(requestId)) {
    const previous = await db.doc(`verificationRequests/${requestId}`).get();
    if (previous.get("userId") === uid) {
      const retryAt = verificationRetryAt(previous.data());
      if (retryAt > Date.now())
        throw new VerificationError(
          "Повторная заявка доступна через 24 часа после отказа.",
          429,
          retryAt,
        );
    }
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const contentType =
    bytes.subarray(0, 5).toString("ascii") === "%PDF-"
      ? "application/pdf"
      : bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? "image/png"
        : bytes.length > 3 &&
            bytes[0] === 255 &&
            bytes[1] === 216 &&
            bytes[2] === 255
          ? "image/jpeg"
          : bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
              bytes.subarray(8, 12).toString("ascii") === "WEBP"
            ? "image/webp"
            : "";
  if (
    !contentType ||
    (kind === "portfolio" && contentType === "application/pdf")
  )
    throw new VerificationError(
      kind === "portfolio"
        ? "Для портфолио подойдут фото JPG, PNG или WebP."
        : "Подойдут PDF, JPG, PNG или WebP.",
    );
  const budgetRef = db.doc(`verificationUploadLimits/${uid}`),
    day = new Date().toISOString().slice(0, 10);
  await db.runTransaction(async (tx) => {
    const saved = await tx.get(budgetRef),
      sameDay = saved.get("day") === day;
    const count = sameDay ? Number(saved.get("count") || 0) : 0,
      size = sameDay ? Number(saved.get("bytes") || 0) : 0;
    if (count >= 24 || size + bytes.length > 100 * 1024 * 1024)
      throw new VerificationError(
        "Лимит загрузки на сегодня исчерпан. Повторите завтра.",
        429,
      );
    tx.set(budgetRef, {
      day,
      count: count + 1,
      bytes: size + bytes.length,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  const id = randomUUID(),
    target = path.join(privateRoot(), id);
  const data = {
    ownerUid: uid,
    name:
      file.name.replace(/[\x00-\x1f\x7f/\\]/g, "_").slice(0, 180) || "Документ",
    size: bytes.length,
    contentType,
    kind,
    requestIds: [],
    createdAt: FieldValue.serverTimestamp(),
  };
  await mkdir(privateRoot(), { recursive: true, mode: 0o700 });
  await writeFile(target, bytes, { mode: 0o600, flag: "wx" });
  try {
    await db.doc(`verificationAttachments/${id}`).create(data);
  } catch (error) {
    await rm(target, { force: true });
    throw error;
  }
  return verificationAttachmentView(id, data);
}
async function readable(actor: DecodedIdToken, id: string) {
  if (!isVerificationFileId(id))
    throw new VerificationError("Файл не найден.", 404);
  const ref = getAdminDb().doc(`verificationAttachments/${id}`),
    snapshot = await ref.get();
  if (
    !snapshot.exists ||
    (snapshot.get("ownerUid") !== actor.uid && !hasModeratorClaim(actor))
  )
    throw new VerificationError("Файл не найден или недоступен.", 404);
  return snapshot;
}
export async function readVerificationAttachment(
  actor: DecodedIdToken,
  id: string,
) {
  const snapshot = await readable(actor, id);
  let bytes: Buffer;
  try {
    bytes = await readFile(path.join(privateRoot(), id));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new VerificationError("Файл не найден.", 404);
    throw error;
  }
  return { file: verificationAttachmentView(id, snapshot.data()!), bytes };
}
export async function removeVerificationAttachment(
  actor: DecodedIdToken,
  id: string,
) {
  await readable(actor, id);
  const db = getAdminDb(),
    ref = db.doc(`verificationAttachments/${id}`);
  const removed = await db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists) return false;
    if (current.get("ownerUid") !== actor.uid)
      throw new VerificationError(
        "Файл может удалить только его владелец.",
        403,
      );
    // A submitted request is an immutable record for its moderator and owner.
    if ((current.get("requestIds") || []).length) return false;
    tx.delete(ref);
    return true;
  });
  if (removed) await rm(path.join(privateRoot(), id), { force: true });
  return { ok: true, retainedInHistory: !removed };
}
