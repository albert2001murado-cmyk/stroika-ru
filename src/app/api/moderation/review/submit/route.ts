import { limitRequests } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { processReview } from "@/lib/review-moderation-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearer(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function moderator(data: Record<string, unknown>) {
  return (
    data.role === "admin" ||
    data.role === "moderator" ||
    data.isAdmin === true ||
    data.isModerator === true
  );
}

export async function POST(request: NextRequest) {
  try {
    const token = bearer(request);
    if (!token) return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });
    const decoded = await getAdminAuth().verifyIdToken(token);
    const throttled = limitRequests("moderation/reviews/submit:" + decoded.uid, 10);
    if (throttled) return throttled;
    const body = await request.json();
    const reviewId = String(body?.reviewId || "").trim().slice(0, 160);
    if (!reviewId || reviewId.includes("/")) {
      return NextResponse.json({ error: "Некорректный отзыв." }, { status: 400 });
    }
    const [review, profile] = await Promise.all([
      getAdminDb().collection("reviews").doc(reviewId).get(),
      getAdminDb().collection("users").doc(decoded.uid).get(),
    ]);
    if (!review.exists) return NextResponse.json({ error: "Отзыв не найден." }, { status: 404 });
    const profileData = (profile.data() || {}) as Record<string, unknown>;
    if (review.data()?.authorId !== decoded.uid && !moderator(profileData)) {
      return NextResponse.json({ error: "Нет доступа." }, { status: 403 });
    }
    const result = await processReview(reviewId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("review moderation submit error", error);
    return NextResponse.json(
      { error: "Отзыв поставлен в очередь и будет проверен автоматически." },
      { status: 503 }
    );
  }
}
