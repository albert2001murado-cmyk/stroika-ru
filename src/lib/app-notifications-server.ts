import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./firebase-admin";
import { AccountApiError } from "./account-api-server";
import { validExpoPushToken } from "./security-policy";

export const appNotificationSettingsRef = (uid: string) =>
  getAdminDb().doc(`users/${uid}/notificationSettings/app`);
const tokenOwnerRef = (token: string) => getAdminDb().doc(`appPushTokenOwners/${createHash("sha256").update(token).digest("hex")}`);
const tokenId = (token: string) => encodeURIComponent(token).replace(/\./g, "%2E");

export async function appNotificationPreferences(uid: string) {
  return { enabled: (await appNotificationSettingsRef(uid).get()).get("enabled") !== false };
}

/** Registration never turns a user's master switch back on, including after reinstall. */
export async function saveAppNotificationPreferences(uid: string, input: Record<string, unknown>) {
  const registration = input.action === "register";
  if (input.source !== "mobile" || (registration
    ? !validExpoPushToken(input.token) || !["ios", "android"].includes(String(input.platform))
    : typeof input.enabled !== "boolean")) throw new AccountApiError("Проверьте настройки уведомлений");
  const db = getAdminDb(), ref = appNotificationSettingsRef(uid), engagement = db.doc(`engagementProfiles/${uid}`);
  await db.runTransaction(async tx => {
    const [saved, previous] = await Promise.all([tx.get(ref), tx.get(engagement)]);
    const enabled = registration ? saved.get("enabled") !== false : input.enabled === true;
    const changed = !saved.exists || saved.get("enabled") !== enabled;
    const newlyConsented = previous.get("consentVersion") !== 2 || previous.get("source") !== "mobile";
    tx.set(ref, { enabled, source: "mobile", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(engagement, {
      uid, enabled, expiryReminders: enabled, intervalMinutes: 120, quietHours: true,
      quietStart: 23, quietEnd: 9, timeZone: "Europe/Moscow", source: "mobile", consentVersion: 2,
      ...(newlyConsented || changed ? { topics: [], seen: [], lastSentAt: Date.now(), consentAt: FieldValue.serverTimestamp() } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (registration) {
      const token = String(input.token);
      tx.set(db.doc(`users/${uid}/pushTokens/${tokenId(token)}`), {
        userId: uid, token, platform: input.platform, enabled: true,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      // A phone may change accounts. An old account must not retain this phone's pushes.
      tx.set(tokenOwnerRef(token), { uid, updatedAt: FieldValue.serverTimestamp() });
    }
  });
  return appNotificationPreferences(uid);
}

/** Shared by every sender: messages, moderation, nearby orders and discovery pushes. */
export async function activeAppPushTokens(uid: string) {
  const db = getAdminDb();
  const [settings, profile] = await Promise.all([appNotificationSettingsRef(uid).get(), db.doc(`users/${uid}`).get()]);
  if (settings.get("enabled") === false || !profile.exists || profile.get("moderationStatus") === "blocked") return [];
  const snapshot = await db.collection(`users/${uid}/pushTokens`).where("enabled", "==", true).limit(100).get();
  const tokens = [...new Set(snapshot.docs.filter(item => item.get("platform") !== "web").map(item => item.get("token")).filter(validExpoPushToken))];
  if (!tokens.length) return [];
  const owners = await db.getAll(...tokens.map(tokenOwnerRef));
  if ((await appNotificationSettingsRef(uid).get()).get("enabled") === false) return [];
  return tokens.filter((_, index) => !owners[index].exists || owners[index].get("uid") === uid);
}
