import { readJsonObject, RequestBodyError } from "@/lib/request-body";
import { hasModeratorClaim } from "@/lib/security-policy";
import { limitRequests, activeProfileGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import {
  processPublication,
  publicationOwnerId,
} from "@/lib/publication-moderation-server";
import type { PublicationKind } from "@/lib/publication-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function bearer(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function publicationKind(value: unknown): PublicationKind | null {
  return value === "listing" || value === "request" ? value : null;
}


export async function POST(request: NextRequest) {
  const totalLimit = limitRequests("moderation/submit:total", 120);
  if (totalLimit) return totalLimit;
  try {
    const token = bearer(request);
    if (!token) {
      return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(token, true);
    const inactive = await activeProfileGuard(decoded.uid);
    if (inactive) return inactive;
    const throttled = limitRequests("moderation/submit:" + decoded.uid, 15);
    if (throttled) return throttled;
    const body = await readJsonObject(request);
    const kind = publicationKind(body?.kind);
    const publicationId = String(body?.publicationId || "").trim().slice(0, 160);
    if (!kind || !publicationId || publicationId.includes("/")) {
      return NextResponse.json({ error: "Некорректная публикация." }, { status: 400 });
    }

    const db = getAdminDb();
    const collectionName = kind === "listing" ? "listings" : "customerRequests";
    const publication = await db.collection(collectionName).doc(publicationId).get();
    if (!publication.exists) {
      return NextResponse.json({ error: "Публикация не найдена." }, { status: 404 });
    }

    const owner = publicationOwnerId(kind, publication.data() || {});
    if (owner !== decoded.uid && !hasModeratorClaim(decoded)) {
      return NextResponse.json({ error: "Нет доступа." }, { status: 403 });
    }

    const result = await processPublication(kind, publicationId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("moderation submit route error", error);
    return NextResponse.json(
      { error: "Проверка поставлена в очередь и будет повторена автоматически." },
      { status: 503 }
    );
  }
}
