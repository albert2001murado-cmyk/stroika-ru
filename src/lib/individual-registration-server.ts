import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { Auth, UserRecord } from "firebase-admin/auth";
import { ContactError, contactPhone, preparePhoneChange } from "./unique-phone-server";
import { normalizeRussianPhone } from "./phone";

export async function saveIndividualProfile(db: Firestore, auth: Auth, user: UserRecord, input: { phone?: unknown; displayName?: unknown; city?: unknown }, updateOnly = false) {
  const phone = contactPhone(input.phone);
  if (!user.email && user.phoneNumber !== phone) throw new ContactError("registration/identity", "Подтвердите вход в аккаунт.", 401);
  const name = typeof input.displayName === "string" ? input.displayName.trim() : user.displayName || user.email?.split("@")[0] || "Пользователь";
  const city = typeof input.city === "string" ? input.city.trim() : "";
  if (!name || name.length > 120 || city.length > 200) throw new ContactError("registration/invalid-profile", "Проверьте имя и город.", 400);
  return db.runTransaction(async transaction => {
    const current = await transaction.get(db.collection("users").doc(user.uid));
    const data = current.data();
    const registered = Boolean(data && (data.accountType || data.createdAt));
    if (!updateOnly && registered && (data?.accountType !== "individual" || normalizeRussianPhone(data?.phone) !== phone)) {
      throw new ContactError("registration/already-completed", "Аккаунт уже зарегистрирован. Войдите в него.");
    }
    const change = await preparePhoneChange(db, auth, transaction, user, phone);
    const now = FieldValue.serverTimestamp();
    const profile = registered ? { ...data!, uid: user.uid, phone, updatedAt: now } : {
      uid: user.uid, email: user.email?.trim().toLowerCase() || "", displayName: name, name, representativeName: name,
      city, phone, accountType: "individual", companyName: "", photoURL: "", avatarUrl: "", avatarPath: "",
      verified: false, isVerified: false, verificationStatus: "unverified", verifiedAt: null, verifiedBy: "", createdAt: now, updatedAt: now,
    };
    change.apply();
    transaction.set(change.userRef, profile, { merge: true });
    return profile;
  });
}
