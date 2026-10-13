import { limitRequests, activeProfileGuard } from "@/lib/api-guard";
import { readJsonObject, RequestBodyError } from "@/lib/request-body";
import { hasModeratorClaim } from "@/lib/security-policy";
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { runModerationBatch } from "@/lib/publication-moderation-server";
import { runReviewModerationBatch } from "@/lib/review-moderation-server";
import { runProfileAvatarSyncBatch } from "@/lib/profile-avatar-sync-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function bearer(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function sameSecret(left: string, right: string) {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

async function authorized(request: NextRequest) {
  const token = bearer(request);
  if (sameSecret(token, String(process.env.MODERATION_CRON_SECRET || ""))) {
    return true;
  }
  if (!token) return false;

  try {
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    if (await activeProfileGuard(decoded.uid)) return false;
    return hasModeratorClaim(decoded);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const totalLimit = limitRequests("moderation/run:total", 120);
  if (totalLimit) return totalLimit;
  if (!(await authorized(request))) {
    return NextResponse.json({ error: "Нет доступа." }, { status: 401 });
  }

  try {
    const body = await readJsonObject(request, true);
    const requested = Number(body?.limit);
    const limit = Number.isFinite(requested)
      ? Math.max(1, Math.min(100, Math.floor(requested)))
      : 30;
    const [result, reviews, avatars] = await Promise.all([
      runModerationBatch(limit),
      runReviewModerationBatch(limit),
      runProfileAvatarSyncBatch(Math.min(limit, 10)),
    ]);
    return NextResponse.json({ ok: true, ...result, reviews, avatars });
  } catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("moderation batch route error", error);
    return NextResponse.json({ error: "Не удалось выполнить очередь." }, { status: 500 });
  }
}
