import type { Auth, UserRecord } from "firebase-admin/auth";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { normalizeRussianPhone } from "./phone";

export const PHONE_INDEX_CONFIG = "identityGuards/phones";
export const PHONE_CLAIMS = "phoneClaims";
export class ContactError extends Error {
  constructor(public code: string, message: string, public status = 409) { super(message); }
}
export function contactPhone(value: unknown) {
  const phone = typeof value === "string" && value.length <= 64 ? normalizeRussianPhone(value) : "";
  if (!phone) throw new ContactError("registration/invalid-phone", "Введите номер в формате +7 (999) 123-45-67.", 400);
  return phone;
}
function taken(): never {
  throw new ContactError("auth/phone-number-already-in-use", "Этот номер телефона уже используется другим аккаунтом.");
}
function owners(data: Record<string, any> | undefined): string[] {
  if (!data) return [];
  const values = Array.isArray(data.owners) ? data.owners : typeof data.ownerUid === "string" ? [data.ownerUid] : null;
  if (!values || !values.every(uid => typeof uid === "string" && uid.length > 0 && uid.length <= 128 && !uid.includes("/"))) {
    throw new ContactError("registration/phone-index-invalid", "Не удалось проверить номер. Повторите попытку позже.", 503);
  }
  return [...new Set(values)];
}
export async function phoneIndexReady(db: Firestore, transaction?: Transaction) {
  const ref = db.doc(PHONE_INDEX_CONFIG);
  const snapshot = transaction ? await transaction.get(ref) : await ref.get();
  if (snapshot.get("ready") !== true || snapshot.get("version") !== 1) {
    throw new ContactError("registration/phone-index-not-ready", "Проверка номеров обновляется. Попробуйте зарегистрироваться немного позже.", 503);
  }
}
async function authExists(auth: Auth, uid: string) {
  try { await auth.getUser(uid); return true; }
  catch (error) { if ((error as { code?: string }).code === "auth/user-not-found") return false; throw error; }
}
async function checkVerifiedNumber(auth: Auth, phone: string, uid: string) {
  let user: UserRecord;
  try { user = await auth.getUserByPhoneNumber(phone); }
  catch (error) { if ((error as { code?: string }).code === "auth/user-not-found") return; throw error; }
  if (user.uid !== uid) taken();
}
async function checkOwners(db: Firestore, auth: Auth, values: string[], uid: string, transaction?: Transaction) {
  for (const owner of values) {
    if (owner === uid) continue;
    const ref = db.collection("users").doc(owner);
    const [profile, existingAuth] = await Promise.all([transaction ? transaction.get(ref) : ref.get(), authExists(auth, owner)]);
    // Reuse a number only after BOTH the profile and Auth account were deleted.
    if (profile.exists || existingAuth) taken();
  }
}
export async function checkPhoneAvailable(db: Firestore, auth: Auth, value: unknown, uid = "") {
  const phone = contactPhone(value);
  await phoneIndexReady(db);
  const claim = await db.collection(PHONE_CLAIMS).doc(phone).get();
  await Promise.all([checkVerifiedNumber(auth, phone, uid), checkOwners(db, auth, owners(claim.data()), uid)]);
  return phone;
}

/** Read first. The caller applies the claim AND profile write in the same transaction. */
export async function preparePhoneChange(db: Firestore, auth: Auth, transaction: Transaction, user: UserRecord, value: unknown) {
  const phone = contactPhone(value), uid = user.uid;
  const userRef = db.collection("users").doc(uid), claimRef = db.collection(PHONE_CLAIMS).doc(phone);
  await phoneIndexReady(db, transaction);
  const [profile, claim] = await Promise.all([transaction.get(userRef), transaction.get(claimRef)]);
  if (profile.get("moderationStatus") === "blocked") throw new ContactError("registration/blocked", "Аккаунту недоступно это действие.", 403);
  const oldPhone = normalizeRussianPhone(profile.get("phone"));
  const oldRef = oldPhone && oldPhone !== phone ? db.collection(PHONE_CLAIMS).doc(oldPhone) : null;
  const oldClaim = oldRef ? await transaction.get(oldRef) : null;
  const currentOwners = owners(claim.data());
  // Preserve historical conflicts until their owners change numbers; never create a new one.
  const unchangedConflict = oldPhone === phone && currentOwners.includes(uid) && currentOwners.length > 1;
  if (!unchangedConflict) await Promise.all([checkVerifiedNumber(auth, phone, uid), checkOwners(db, auth, currentOwners, uid, transaction)]);
  return {
    phone, profile, userRef,
    apply() {
      if (unchangedConflict) return;
      const now = FieldValue.serverTimestamp();
      transaction.set(claimRef, { ownerUid: uid, owners: [uid], updatedAt: now });
      // A verified Firebase phone identity remains reserved even if contact details change.
      if (oldRef && oldClaim?.exists && normalizeRussianPhone(user.phoneNumber) !== oldPhone) {
        const previous = owners(oldClaim.data());
        if (!previous.includes(uid)) return;
        const remaining = previous.filter(owner => owner !== uid);
        if (!remaining.length) transaction.delete(oldRef);
        else transaction.set(oldRef, { ownerUid: remaining.length === 1 ? remaining[0] : null, owners: remaining, updatedAt: now });
      }
    },
  };
}
