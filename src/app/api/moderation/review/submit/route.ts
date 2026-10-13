import { readJsonObject, RequestBodyError } from "@/lib/request-body";
import { hasModeratorClaim } from "@/lib/security-policy";
import { limitRequests, activeProfileGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { processReview } from "@/lib/review-moderation-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearer(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}


export async function POST(request: NextRequest) {
  const totalLimit = limitRequests("moderation/review/submit:total", 120);
  if (totalLimit) return totalLimit;
  try {
    const token = bearer(request);
    if (!token) return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    const inactive = await activeProfileGuard(decoded.uid);
    if (inactive) return inactive;
    const throttled = limitRequests("moderation/reviews/submit:" + decoded.uid, 10);
    if (throttled) return throttled;
    const body = await readJsonObject(request);
    const reviewId = String(body?.reviewId || "").trim().slice(0, 160);
    if (!reviewId || reviewId.includes("/")) {
      return NextResponse.json({ error: "Некорректный отзыв." }, { status: 400 });
    }
    const review = await getAdminDb().collection("reviews").doc(reviewId).get();
    if (!review.exists) return NextResponse.json({ error: "Отзыв не найден." }, { status: 404 });
    if (review.data()?.authorId !== decoded.uid && !hasModeratorClaim(decoded)) {
      return NextResponse.json({ error: "Нет доступа." }, { status: 403 });
    }
    const result = await processReview(reviewId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("review moderation submit error", error);
    return NextResponse.json(
      { error: "Отзыв поставлен в очередь и будет проверен автоматически." },
      { status: 503 }
    );
  }
}
