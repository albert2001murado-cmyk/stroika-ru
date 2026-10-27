import { limitRequests, activeProfileGuard } from "@/lib/api-guard";
import { readJsonObject, RequestBodyError } from "@/lib/request-body";
import { hasModeratorClaim } from "@/lib/security-policy";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { applyManualModerationDecision, PublicationVerificationError } from "@/lib/publication-moderation-server";
import { validateManualModerationReason } from "@/lib/publication-moderation-feedback";
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
  const totalLimit = limitRequests("moderation/review:total", 120);
  if (totalLimit) return totalLimit;
  try {
    const token = bearer(request);
    if (!token) {
      return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });
    }
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    const inactive = await activeProfileGuard(decoded.uid);
    if (inactive) return inactive;
    const userLimit = limitRequests("moderation/review:user:" + decoded.uid, 30);
    if (userLimit) return userLimit;
    const isModerator = hasModeratorClaim(decoded);
    if (!isModerator) {
      return NextResponse.json({ error: "Нет доступа." }, { status: 403 });
    }

    const body = await readJsonObject(request);
    const kind = kindValue(body?.kind);
    const id = String(body?.publicationId || "").trim().slice(0, 160);
    const status = body?.status === "approved" || body?.status === "rejected"
      ? body.status
      : null;
    if (!kind || !id || id.includes("/") || !status) {
      return NextResponse.json({ error: "Некорректное решение." }, { status: 400 });
    }

    if (status === "rejected") {
      const reasonError = validateManualModerationReason(body?.reason);
      if (reasonError) return NextResponse.json({ error: reasonError }, { status: 400 });
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
    if (error instanceof PublicationVerificationError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("moderation review route error", error);
    return NextResponse.json({ error: "Не удалось сохранить решение." }, { status: 500 });
  }
}
