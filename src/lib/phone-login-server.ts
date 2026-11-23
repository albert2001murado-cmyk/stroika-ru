import type { Auth, UserRecord } from "firebase-admin/auth";
import type { Firestore } from "@/lib/database/admin-values";
import { normalizeRussianPhone } from "./phone";
import { PHONE_CLAIMS, phoneIndexReady } from "./unique-phone-server";

/** Resolve privately. Neither email addresses nor the existence of an account
 * are returned by the public login API before password verification. */
export async function phoneLoginAccount(db: Firestore, auth: Auth, phone: string): Promise<UserRecord | null> {
  await phoneIndexReady(db);
  const claim = await db.doc(`${PHONE_CLAIMS}/${phone}`).get();
  const saved = claim.data();
  const ids = new Set<string>(Array.isArray(saved?.owners) ? saved.owners : typeof saved?.ownerUid === "string" ? [saved.ownerUid] : []);
  try { ids.add((await auth.getUserByPhoneNumber(phone)).uid); }
  catch (error) { if ((error as { code?: string }).code !== "auth/user-not-found") throw error; }
  if (ids.size > 20 || [...ids].some(uid => typeof uid !== "string" || !uid || uid.includes("/"))) return null;
  const accounts: UserRecord[] = [];
  for (const uid of ids) {
    let account: UserRecord;
    try { account = await auth.getUser(uid); }
    catch (error) { if ((error as { code?: string }).code === "auth/user-not-found") continue; throw error; }
    const [profile, deletion] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`accountDeletionJobs/${uid}`).get()]);
    if (deletion.exists || account.disabled || profile.get("moderationStatus") === "blocked") continue;
    if (normalizeRussianPhone(profile.get("phone")) !== phone && normalizeRussianPhone(account.phoneNumber) !== phone) continue;
    accounts.push(account);
  }
  // Historical duplicate contacts must never select an arbitrary person's account.
  return accounts.length === 1 && accounts[0].email ? accounts[0] : null;
}
