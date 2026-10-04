import { randomUUID } from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { deliverServerNotification } from "@/lib/server-notifications";

const REVIEW_LEASE_MS = 2 * 60 * 1000;
const REVIEW_POLICY_VERSION = "review-2026-09-29.1";
const PHONE_PATTERN = /(?:\+?7|8)[\s()\-]*\d{3}[\s()\-]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/u;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/u;
const URL_PATTERN = /(?:https?:\/\/|www\.|t\.me\/|vk\.com\/|wa\.me\/)[^\s]+/iu;
const PROFANITY_PATTERN = /(?<![\p{L}\p{N}])(?:бля(?:дь|дство)?|хуй[\p{L}\p{N}_]*|пизд[\p{L}\p{N}_]*|еб(?:ать|ан[\p{L}\p{N}_]*|уч[\p{L}\p{N}_]*)|мудак[\p{L}\p{N}_]*|шлюх[\p{L}\p{N}_]*)(?![\p{L}\p{N}])/iu;

type ReviewDecision = "approved" | "rejected";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeText(value: unknown, maximum = 1_000) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, maximum)
    : "";
}

function millis(value: unknown) {
  if (typeof (value as { toMillis?: unknown })?.toMillis === "function") {
    return Number((value as { toMillis(): number }).toMillis()) || 0;
  }
  const seconds = Number((value as { seconds?: unknown })?.seconds);
  return Number.isFinite(seconds) ? seconds * 1_000 : 0;
}

function reviewDecision(data: Record<string, unknown>): {
  decision: ReviewDecision;
  reason: string;
  code: string;
} {
  const text = safeText(data.text, 2_000);
  const rating = Number(data.rating);

  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { decision: "rejected", code: "invalid-rating", reason: "Укажите оценку от 1 до 5." };
  }
  if (text.length < 3 || text.length > 1_000) {
    return {
      decision: "rejected",
      code: "invalid-review-length",
      reason: "Текст отзыва должен содержать от 3 до 1000 символов.",
    };
  }
  if (PHONE_PATTERN.test(text) || EMAIL_PATTERN.test(text) || URL_PATTERN.test(text)) {
    return {
      decision: "rejected",
      code: "contacts-in-review",
      reason: "Удалите из отзыва телефон, почту или ссылку.",
    };
  }
  if (PROFANITY_PATTERN.test(text)) {
    return {
      decision: "rejected",
      code: "profanity-in-review",
      reason: "Удалите оскорбления и нецензурную лексику.",
    };
  }
  const normalized = text.toLocaleLowerCase("ru-RU").replace(/[^\p{L}\p{N}]+/gu, "");
  if (/^(.)\1{7,}$/u.test(normalized)) {
    return {
      decision: "rejected",
      code: "review-spam",
      reason: "Отзыв похож на спам. Опишите результат работы обычным текстом.",
    };
  }

  return { decision: "approved", code: "", reason: "" };
}

async function recalculateListingRating(listingId: string) {
  if (!listingId || listingId.includes("/")) return;
  const snapshot = await getAdminDb()
    .collection("reviews")
    .where("listingId", "==", listingId)
    .limit(500)
    .get();
  const ratings = snapshot.docs
    .map((document) => object(document.data()))
    .filter((review) => {
      const status = safeText(review.moderationStatus, 32);
      return !status || status === "approved";
    })
    .map((review) => Number(review.rating))
    .filter((rating) => Number.isFinite(rating) && rating >= 1 && rating <= 5);
  const average = ratings.length
    ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10
    : 0;
  await getAdminDb().collection("listings").doc(listingId).set(
    {
      averageRating: average,
      ratingAverage: average,
      reviewsCount: ratings.length,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function recalculateUserRating(targetUserId: string) {
  if (!targetUserId || targetUserId.includes("/")) return;
  const snapshot = await getAdminDb()
    .collection("reviews")
    .where("targetUserId", "==", targetUserId)
    .limit(500)
    .get();
  const ratings = snapshot.docs
    .map((document) => object(document.data()))
    .filter((review) => safeText(review.moderationStatus, 32) === "approved")
    .map((review) => Number(review.rating))
    .filter((rating) => Number.isFinite(rating) && rating >= 1 && rating <= 5);
  const average = ratings.length
    ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10
    : 0;
  await getAdminDb().collection("users").doc(targetUserId).set({
    ratingAverage: average,
    reviewsCount: ratings.length,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function processReview(reviewIdValue: string) {
  const reviewId = safeText(reviewIdValue, 160);
  if (!reviewId || reviewId.includes("/")) throw new Error("Некорректный отзыв.");
  const reference = getAdminDb().collection("reviews").doc(reviewId);
  const runId = randomUUID();
  const now = Date.now();

  const data = await getAdminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) return null;
    const value = object(snapshot.data());
    if (safeText(value.moderationStatus, 32) !== "pending") return null;
    if (value.moderationStage === "checking" && millis(value.moderationLeaseUntil) > now) {
      return null;
    }
    transaction.update(reference, {
      moderationStage: "checking",
      moderationRunId: runId,
      moderationStartedAt: FieldValue.serverTimestamp(),
      moderationLeaseUntil: Timestamp.fromMillis(now + REVIEW_LEASE_MS),
    });
    return value;
  });
  if (!data) return { state: "skipped" as const, id: reviewId };

  const authorId = safeText(data.authorId, 160);
  const profile = authorId && !authorId.includes("/")
    ? await getAdminDb().collection("users").doc(authorId).get()
    : null;
  const result =
    !profile?.exists || profile.data()?.moderationStatus === "blocked"
      ? {
          decision: "rejected" as const,
          code: "review-author-unavailable",
          reason: "Отзыв не может быть опубликован для этого аккаунта.",
        }
      : reviewDecision(data);

  const committed = await getAdminDb().runTransaction(async (transaction) => {
    const latest = await transaction.get(reference);
    if (!latest.exists) return false;
    const latestData = object(latest.data());
    if (
      safeText(latestData.moderationStatus, 32) !== "pending" ||
      safeText(latestData.moderationRunId, 160) !== runId
    ) {
      return false;
    }
    transaction.update(reference, {
      moderationStatus: result.decision,
      moderationStage: "complete",
      moderationReason: result.reason,
      moderationReasonCode: result.code,
      moderationPolicyVersion: REVIEW_POLICY_VERSION,
      moderationProvider: "automatic",
      moderationReviewedBy: "system",
      moderationReviewedAt: FieldValue.serverTimestamp(),
      moderationLeaseUntil: FieldValue.delete(),
      publishedAt: result.decision === "approved" ? FieldValue.serverTimestamp() : null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (!committed) return { state: "superseded" as const, id: reviewId };

  if (result.decision === "approved") {
    await recalculateListingRating(safeText(data.listingId, 160));
    await recalculateUserRating(safeText(data.targetUserId || data.listingAuthorId, 160));
  }

  if (authorId) {
    const targetUrl = data.listingId
      ? `/listing/${safeText(data.listingId, 160)}`
      : `/requests/${safeText(data.requestId, 160)}`;
    await deliverServerNotification({
      recipientId: authorId,
      actorId: "system",
      actorName: "Стройка.ру",
      title: result.decision === "approved" ? "Отзыв опубликован" : "Отзыв отклонён",
      body:
        result.decision === "approved"
          ? "Отзыв прошёл проверку и теперь виден другим пользователям."
          : result.reason,
      url: targetUrl,
      type: "moderation",
      entityId: reviewId,
      dedupeKey: `review-moderation:${reviewId}:${runId}:${result.decision}`,
    }).catch((error) => console.error("review moderation notification failed", error));
  }

  await getAdminDb().collection("moderationLogs").doc(`review_${reviewId}_${runId}`).set({
    kind: "review",
    publicationId: reviewId,
    ownerId: authorId,
    decision: result.decision,
    reason: result.reason,
    flagCodes: result.code ? [result.code] : [],
    policyVersion: REVIEW_POLICY_VERSION,
    provider: "automatic",
    createdAt: FieldValue.serverTimestamp(),
  }).catch((error) => console.error("review moderation log failed", error));

  return { state: "processed" as const, id: reviewId, decision: result.decision };
}

export async function runReviewModerationBatch(maximum = 30) {
  const snapshot = await getAdminDb()
    .collection("reviews")
    .where("moderationStatus", "==", "pending")
    .limit(Math.max(1, Math.min(100, Math.floor(maximum))))
    .get();
  const results = [];
  for (const document of snapshot.docs) {
    try {
      results.push(await processReview(document.id));
    } catch (error) {
      console.error("review moderation failed", document.id, error);
      results.push({ state: "failed" as const, id: document.id });
    }
  }
  return {
    found: snapshot.size,
    processed: results.filter((item) => item.state === "processed").length,
    failed: results.filter((item) => item.state === "failed").length,
    results,
  };
}
