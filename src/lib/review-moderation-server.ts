import { randomUUID, createHash } from "crypto";
import { reviewDecision, REVIEW_POLICY_VERSION } from "./review-content-policy";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { deliverServerNotification } from "@/lib/server-notifications";

const REVIEW_LEASE_MS = 2 * 60 * 1000;
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

export function reviewInputFingerprint(data: Record<string, unknown>) {
  const fields = ["text", "rating", "authorId", "listingId", "requestId", "targetUserId", "listingAuthorId", "publicationId", "publicationKind"];
  return createHash("sha256").update(JSON.stringify(fields.map(key => data[key] ?? null))).digest("hex");
}

async function updateExistingRating(collection: string, id: string, data: Record<string, unknown>) {
  const db = getAdminDb(), target = db.collection(collection).doc(id);
  await db.runTransaction(async tx => { if ((await tx.get(target)).exists) tx.update(target, data); });
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
  await updateExistingRating("listings", listingId,
    {
      averageRating: average,
      ratingAverage: average,
      reviewsCount: ratings.length,
      updatedAt: FieldValue.serverTimestamp(),
    },
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
  await updateExistingRating("users", targetUserId, {
    ratingAverage: average,
    reviewsCount: ratings.length,
    updatedAt: FieldValue.serverTimestamp(),
  });
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

  const inputFingerprint = reviewInputFingerprint(data);
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
    if (reviewInputFingerprint(latestData) !== inputFingerprint) {
      transaction.update(reference, {
        moderationStage: "queued", moderationRunId: FieldValue.delete(),
        moderationLeaseUntil: FieldValue.delete(),
      });
      return false;
    }
    // A block applied during classification takes effect before publication.
    const currentAuthor = authorId && !authorId.includes("/")
      ? await transaction.get(getAdminDb().collection("users").doc(authorId)) : null;
    if (!currentAuthor?.exists || currentAuthor.get("moderationStatus") === "blocked") {
      result.decision = "rejected";
      result.code = "review-author-unavailable";
      result.reason = "Отзыв не может быть опубликован для этого аккаунта.";
    }
    transaction.update(reference, {
      moderationInputFingerprint: inputFingerprint,
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
      actorName: "Строва",
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
