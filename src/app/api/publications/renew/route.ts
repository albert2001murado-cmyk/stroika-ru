import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { limitRequests } from "@/lib/api-guard";
import { isDocumentId } from "@/lib/security-policy";
import { readJsonObject, RequestBodyError } from "@/lib/request-body";
import { PublicationRenewalError, renewOwnedPublication } from "@/lib/publication-renewal-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function privateResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Vary", "Authorization");
  return response;
}
function json(body: unknown, status = 200) { return privateResponse(NextResponse.json(body, { status })); }

export async function POST(request: NextRequest) {
  const total = limitRequests("publications/renew:total", 120);
  if (total) return privateResponse(total);
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ") || header.length > 8192) return json({ error: "Войдите в аккаунт для повторной публикации." }, 401);
  let viewer;
  try { viewer = await getAdminAuth().verifyIdToken(header.slice(7).trim(), true); }
  catch { return json({ error: "Сессия недействительна. Войдите снова." }, 401); }
  const limited = limitRequests("publications/renew:" + viewer.uid, 10);
  if (limited) return privateResponse(limited);
  try {
    const body = await readJsonObject(request, false, 1024);
    const kind = body.kind;
    const publicationId = typeof body.publicationId === "string" ? body.publicationId : "";
    const expected = body.expectedExpiresAt;
    if ((kind !== "listing" && kind !== "request") || !isDocumentId(publicationId) || typeof expected !== "number" || !Number.isFinite(expected) || expected <= 0 || expected > 8.64e15) {
      return json({ error: "Некорректное объявление или срок размещения." }, 400);
    }
    const result = await renewOwnedPublication({ uid: viewer.uid, authTime: viewer.auth_time, kind, publicationId, expectedExpiresAt: expected });
    return json(result);
  } catch (error) {
    if (error instanceof RequestBodyError || error instanceof PublicationRenewalError) return json({ error: error.message }, error.status);
    return json({ error: "Не удалось отправить объявление на публикацию. Повторите попытку." }, 503);
  }
}
