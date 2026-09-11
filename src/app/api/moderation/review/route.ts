import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { applyManualModerationDecision } from "@/lib/publication-moderation-server";
import type { PublicationKind } from "@/lib/publication-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function bearer(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function kindValue(value: unknown): PublicationKind | null {
  return value === "listing" || value === "request" ? value : null;
}

export async function POST(request: NextRequest) {
  try {
    const token = bearer(request);
    if (!token) {
      return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });
    }
    const decoded = await getAdminAuth().verifyIdToken(token);
    const profile = await getAdminDb().collection("users").doc(decoded.uid).get();
    const data = (profile.data() || {}) as Record<string, unknown>;
    const isModerator =
      data.role === "admin" ||
      data.role === "moderator" ||
      data.isAdmin === true ||
      data.isModerator === true;
    if (!isModerator) {
      return NextResponse.json({ error: "Нет доступа." }, { status: 403 });
    }

    const body = await request.json();
    const kind = kindValue(body?.kind);
    const id = String(body?.publicationId || "").trim().slice(0, 160);
    const status = body?.status === "approved" || body?.status === "rejected"
      ? body.status
      : null;
    if (!kind || !id || id.includes("/") || !status) {
      return NextResponse.json({ error: "Некорректное решение." }, { status: 400 });
    }

    const result = await applyManualModerationDecision({
      kind,
      id,
      status,
      reason: String(body?.reason || ""),
      reviewerId: decoded.uid,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("moderation review route error", error);
    return NextResponse.json({ error: "Не удалось сохранить решение." }, { status: 500 });
  }
}
