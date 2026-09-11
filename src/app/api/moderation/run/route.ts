import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { runModerationBatch } from "@/lib/publication-moderation-server";

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
    const decoded = await getAdminAuth().verifyIdToken(token);
    const profile = await getAdminDb().collection("users").doc(decoded.uid).get();
    const data = (profile.data() || {}) as Record<string, unknown>;
    return (
      data.role === "admin" ||
      data.role === "moderator" ||
      data.isAdmin === true ||
      data.isModerator === true
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!(await authorized(request))) {
    return NextResponse.json({ error: "Нет доступа." }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const requested = Number(body?.limit);
    const limit = Number.isFinite(requested)
      ? Math.max(1, Math.min(100, Math.floor(requested)))
      : 30;
    const result = await runModerationBatch(limit);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("moderation batch route error", error);
    return NextResponse.json({ error: "Не удалось выполнить очередь." }, { status: 500 });
  }
}
