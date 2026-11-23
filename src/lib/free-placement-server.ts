import { FieldValue, type DocumentData, type Transaction } from "@/lib/database/admin-values";
import { AccountApiError } from "./account-api-server";
import { canAccountPublish } from "./accountVerification";
import { getAdminDb } from "./firebase-admin";
import { FREE_CATALOGS, FREE_LIMIT, type FreeCatalog, type FreePlacementState } from "./free-placement";

export const freePlacementRef = (uid: string) => getAdminDb().doc(`freePlacementAccounts/${uid}`);

export function freePlacementView(data?: DocumentData): FreePlacementState {
  return Object.fromEntries(FREE_CATALOGS.map(catalog => {
    const slot = data?.catalogs?.[catalog];
    const active = slot?.active === true;
    const used = Number.isSafeInteger(slot?.used) && slot.used >= 0 ? slot.used : FREE_LIMIT;
    return [catalog, { active, remaining: active ? Math.max(0, FREE_LIMIT - used) : FREE_LIMIT }];
  })) as FreePlacementState;
}

export async function getFreePlacement(uid: string) {
  return freePlacementView((await freePlacementRef(uid).get()).data());
}

export async function activateFreeCatalog(uid: string, catalog: FreeCatalog) {
  const db = getAdminDb(), ref = freePlacementRef(uid);
  return db.runTransaction(async tx => {
    const [profile, saved] = await Promise.all([tx.get(db.doc(`users/${uid}`)), tx.get(ref)]);
    if (!canAccountPublish(profile.data())) throw new AccountApiError("Аккаунту недоступно размещение", 403);
    const data = saved.data();
    if (freePlacementView(data)[catalog].active) return freePlacementView(data);
    const catalogs = { ...data?.catalogs, [catalog]: { active: true, used: 0, activatedAt: FieldValue.serverTimestamp() } };
    tx.set(ref, { catalogs, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return freePlacementView({ catalogs });
  });
}

export function assertFreeCatalog(data: DocumentData | undefined, catalog: FreeCatalog, create: boolean) {
  const slot = freePlacementView(data)[catalog];
  if (!slot.active) throw new AccountApiError("Подключите бесплатное размещение в этом каталоге", 409, "activation-required");
  if (create && slot.remaining === 0) throw new AccountApiError("Все три бесплатных размещения в этом каталоге использованы", 409, "free-limit-used");
}

export function recordFreePlacement(tx: Transaction, uid: string, catalog: FreeCatalog, create: boolean) {
  // The same document is also written on renewal so concurrent writes in a
  // catalog cannot both pass the active publication check.
  const ref = freePlacementRef(uid);
  if (create) tx.update(ref, { [`catalogs.${catalog}.used`]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
  else tx.set(ref, { updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}
