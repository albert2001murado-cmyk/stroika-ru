import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "./firebase-admin";
import { canAccountPublish } from "./accountVerification";
import { isPublicationExpired, oneCalendarMonthAfter, publicationDateMillis, publicationExpiryMillis } from "./publication-lifetime";

export type PublicationKind = "listing" | "request";
export class PublicationRenewalError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function renewOwnedPublication(input: {
  uid: string; authTime: number; kind: PublicationKind; publicationId: string; expectedExpiresAt: number;
}) {
  const db = getAdminDb();
  const ref = db.collection(input.kind === "listing" ? "listings" : "customerRequests").doc(input.publicationId);
  return db.runTransaction(async transaction => {
    const [profile, revocation, snapshot] = await Promise.all([
      transaction.get(db.collection("users").doc(input.uid)),
      transaction.get(db.collection("authRevocations").doc(input.uid)),
      transaction.get(ref),
    ]);
    if (revocation.exists && !(input.authTime > revocation.data()?.validAfter)) {
      throw new PublicationRenewalError("Сессия недействительна. Войдите снова.", 401);
    }
    const user = profile.data() || {};
    if (!profile.exists || user.moderationStatus === "blocked") throw new PublicationRenewalError("Аккаунту недоступна публикация.", 403);
    if (!canAccountPublish(user)) {
      throw new PublicationRenewalError("Для повторной публикации пройдите проверку аккаунта.", 403);
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
    const expiresAt = oneCalendarMonthAfter(now.toMillis());
    const renewalCount = Math.max(0, Math.floor(Number(source.renewalCount) || 0)) + 1;
    const firstCreatedAt = publicationDateMillis(source.firstCreatedAt) || publicationDateMillis(source.createdAt) || publicationDateMillis(source.publishedAt);
    transaction.update(ref, {
      // createdAt is the current placement date, so existing feeds also surface a renewed ad.
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
    return { kind: input.kind, publicationId: input.publicationId, alreadyRenewed: false,
      createdAt: now.toMillis(), expiresAt, renewalCount, moderationStatus: "pending" };
  });
}
