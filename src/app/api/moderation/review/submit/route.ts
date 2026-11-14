import { NextRequest } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { accountActor, accountBody, accountFailure, accountJson, AccountApiError } from "@/lib/account-api-server";
import { processReview } from "@/lib/review-moderation-server";
import { hasModeratorClaim } from "@/lib/security-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const actor = await accountActor(request, "review-moderation");
    const body = await accountBody(request);
    const id = body.reviewId;
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(id)) {
      throw new AccountApiError("Некорректный отзыв");
    }
    const review = await getAdminDb().collection("reviews").doc(id).get();
    if (!review.exists) throw new AccountApiError("Отзыв не найден", 404);
    if (review.get("authorId") !== actor.uid && !hasModeratorClaim(actor)) {
      throw new AccountApiError("Нет доступа к отзыву", 403);
    }
    return accountJson({ ok: true, ...await processReview(id) });
  } catch (error) {
    return accountFailure(error);
  }
}
