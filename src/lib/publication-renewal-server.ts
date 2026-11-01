import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { BILLING_PERIOD_MS } from "./billing";
import { billingAccountRef, billingHash, ensureBillingAccount, publicationBillingPath, ownPublications, assertPublicationSlot, consumePublicationAllowance } from "./billing-server";
import { AccountApiError } from "./account-api-server";
import { getAdminDb } from "./firebase-admin";
import { canAccountPublish } from "./accountVerification";
import { isPublicationExpired, oneCalendarMonthAfter, publicationDateMillis, publicationExpiryMillis } from "./publication-lifetime";

export type PublicationKind = "listing" | "request";
export class PublicationRenewalError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function renewOwnedPublication(input: {
  uid: string; authTime: number; kind: PublicationKind; publicationId: string; expectedExpiresAt: number; funding: "free" | "plan";
}) {
  await ensureBillingAccount(input.uid);
  const db = getAdminDb();
  const ref = db.collection(input.kind === "listing" ? "listings" : "customerRequests").doc(input.publicationId);
  return db.runTransaction(async transaction => {
    const [profile, revocation, snapshot, billing] = await Promise.all([
      transaction.get(db.collection("users").doc(input.uid)),
      transaction.get(db.collection("authRevocations").doc(input.uid)),
      transaction.get(ref),
      transaction.get(billingAccountRef(input.uid)),
    ]);
    if (revocation.exists && !(input.authTime > revocation.data()?.validAfter)) {
      throw new PublicationRenewalError("Сессия недействительна. Войдите снова.", 401);
    }
    const user = profile.data() || {};
    if (!profile.exists || user.moderationStatus === "blocked") throw new PublicationRenewalError("Аккаунту недоступна публикация.", 403);
    if (!canAccountPublish(user)) {
      throw new PublicationRenewalError("Аккаунту недоступна повторная публикация. Обратитесь в поддержку.", 403);
    }
    if (!snapshot.exists) throw new PublicationRenewalError("Объявление не найдено.", 404);
    const source = snapshot.data() || {};
    const owner = input.kind === "listing" ? source.authorId : source.customerId;
    if (owner !== input.uid) throw new PublicationRenewalError("Повторно разместить объявление может только его владелец.", 403);
    if (!["", "approved", "pending", "manual_review", "rejected"].includes(String(source.moderationStatus || "")) || source.deleted === true || source.isDeleted === true || source.hidden === true || source.isHidden === true) {
      throw new PublicationRenewalError("Повторная публикация этого объявления недоступна. Обратитесь в поддержку.", 403);
    }
    const now = Timestamp.now();
    const deadline = publicationExpiryMillis(source);
    if (!deadline) throw new PublicationRenewalError("Не удалось определить срок объявления. Обратитесь в поддержку.", 409);
    if (deadline !== input.expectedExpiresAt) {
      // A retry, or the same button pressed on another device, must not add another month.
      if (Number(source.renewalCount) > 0 && deadline > input.expectedExpiresAt && !isPublicationExpired(source, now.toMillis())) {
        return { kind: input.kind, publicationId: input.publicationId, alreadyRenewed: true,
          createdAt: publicationDateMillis(source.createdAt), expiresAt: deadline,
          renewalCount: Number(source.renewalCount) || 0, moderationStatus: String(source.moderationStatus || "approved") };
      }
      throw new PublicationRenewalError("Срок объявления изменился. Обновите профиль и повторите попытку.", 409);
    }
    if (!isPublicationExpired(source, now.toMillis())) throw new PublicationRenewalError("Срок ещё не истёк. Повторная публикация появится после его окончания.", 409);
    const account = billing.data()!;
    if (input.funding === "free" && !(account.introEligible === true && !account.freeRenewalUsed)) throw new AccountApiError("Бесплатное продление уже использовано. Выберите размещение по тарифу", 409, "renewal-gift-used");
    const catalog = publicationBillingPath(source);
    const owned = await ownPublications(transaction, input.uid);
    const consumed = consumePublicationAllowance(account, catalog.catalogSection, input.funding === "free", now.toMillis());
    assertPublicationSlot(owned, { ...source, ...catalog }, input.kind, consumed.limit, input.publicationId, now.toMillis());
    const expiresAt = now.toMillis() + BILLING_PERIOD_MS;
    const renewalCount = Math.max(0, Math.floor(Number(source.renewalCount) || 0)) + 1;
    const firstCreatedAt = publicationDateMillis(source.firstCreatedAt) || publicationDateMillis(source.createdAt) || publicationDateMillis(source.publishedAt);
    transaction.update(ref, {
      // createdAt is the current placement date, so existing feeds also surface a renewed ad.
      ...catalog, publicationTermDays: 30, billingManaged: true,
      engagementTopicKey: billingHash(`${catalog.catalogSection}:${catalog.catalogCategoryId}:${catalog.subcategory}`),
      firstCreatedAt: firstCreatedAt ? Timestamp.fromMillis(firstCreatedAt) : null,
      createdAt: now, renewedAt: now, expiresAt: Timestamp.fromMillis(expiresAt), renewalCount,
      publishedAt: null, updatedAt: now,
      status: "active",
      moderationStatus: "pending", moderationStage: "queued", moderationSubmittedAt: now,
      moderationReason: "", moderationReasonCode: "", moderationFlags: [],
      moderationRunId: FieldValue.delete(), moderationLeaseUntil: FieldValue.delete(),
      moderationNextRetryAt: FieldValue.delete(), moderationRetryFingerprint: FieldValue.delete(),
      moderationRetryCount: 0,
    });
    transaction.set(billingAccountRef(input.uid), consumed.account);
    transaction.create(db.doc(`billingUsages/${billingHash(`${input.kind}:${input.publicationId}:${renewalCount}`)}`), { uid: input.uid, kind: input.kind, publicationId: input.publicationId, renewalCount, catalog: catalog.catalogSection, funding: consumed.funding, periodId: consumed.periodId, orderId: consumed.orderId, createdAt: FieldValue.serverTimestamp() });
    return { kind: input.kind, publicationId: input.publicationId, alreadyRenewed: false,
      createdAt: now.toMillis(), expiresAt, renewalCount, moderationStatus: "pending" };
  });
}
