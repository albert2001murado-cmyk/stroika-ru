import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "./firebase-admin";
import { activeProfileGuard, limitRequests } from "./api-guard";
import { RequestBodyError } from "./request-body";
import { ContactError } from "./unique-phone-server";

export async function contactUser(request: Request) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ") || header.length > 8192) throw new ContactError("registration/session", "Войдите в аккаунт и повторите попытку.", 401);
  const auth = getAdminAuth(), db = getAdminDb();
  let decoded;
  try { decoded = await auth.verifyIdToken(header.slice(7).trim(), true); }
  catch { throw new ContactError("registration/session", "Сессия недействительна. Войдите снова.", 401); }
  const inactive = await activeProfileGuard(decoded.uid, true);
  if (inactive) throw new ContactError("registration/blocked", "Аккаунту недоступно это действие.", 403);
  const limited = limitRequests(`contact:${decoded.uid}`, 12);
  if (limited) throw new ContactError("registration/rate-limit", "Слишком много попыток. Повторите немного позже.", 429);
  const user = await auth.getUser(decoded.uid);
  return { auth, db, user };
}
export function contactApiError(error: unknown, notCommitted = true) {
  if (error instanceof ContactError || error instanceof RequestBodyError) {
    return NextResponse.json({ error: error.message, code: error instanceof ContactError ? error.code : "registration/bad-request", notCommitted }, { status: error.status });
  }
  console.error("Contact operation failed:", (error as { code?: string } | null)?.code || "internal");
  return NextResponse.json({ error: "Не удалось проверить данные. Повторите попытку позже.", code: "registration/unavailable", notCommitted }, { status: 503 });
}
export function contactResponseData(value: any): any {
  if (value && typeof value.toMillis === "function" && typeof value.seconds === "number") return { seconds: value.seconds, nanoseconds: value.nanoseconds || 0 };
  if (Array.isArray(value)) return value.map(contactResponseData);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, contactResponseData(item)]));
  return value;
}
