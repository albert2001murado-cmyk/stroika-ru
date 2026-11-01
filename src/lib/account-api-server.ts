import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "./firebase-admin";
import { limitRequests } from "./api-guard";
import { readVerificationBody } from "./verification-api-server";

export class AccountApiError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "invalid-request") { super(message); }
}
export function accountJson(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Authorization" } });
}
export async function accountActor(request: NextRequest, action: string) {
  const value = request.headers.get("authorization") || "";
  if (!value.startsWith("Bearer ") || value.length > 8192) throw new AccountApiError("Войдите в аккаунт", 401);
  let actor;
  try { actor = await getAdminAuth().verifyIdToken(value.slice(7).trim(), true); }
  catch { throw new AccountApiError("Сессия недействительна. Войдите снова", 401); }
  const db = getAdminDb();
  const [profile, revocation] = await Promise.all([db.doc(`users/${actor.uid}`).get(), db.doc(`authRevocations/${actor.uid}`).get()]);
  if (revocation.exists && !(actor.auth_time > Number(revocation.get("validAfter")))) throw new AccountApiError("Войдите снова", 401);
  if (!profile.exists || profile.get("moderationStatus") === "blocked") throw new AccountApiError("Аккаунту недоступно это действие", 403);
  if (limitRequests(`account:${action}:${actor.uid}`, request.method === "GET" ? 60 : 18)) throw new AccountApiError("Слишком много попыток. Подождите минуту", 429);
  return actor;
}
export const accountBody = readVerificationBody;
export function accountFailure(error: unknown) {
  if (error instanceof AccountApiError) return accountJson({ error: error.message, code: error.code }, error.status);
  // The bounded body reader has an equally safe, user-facing status/message.
  if (error instanceof Error && "status" in error && Number.isInteger(error.status) && Number(error.status) >= 400 && Number(error.status) < 500)
    return accountJson({ error: error.message }, Number(error.status));
  console.error("account operation failed", { code: String((error as { code?: string })?.code || "unavailable").slice(0, 70) });
  return accountJson({ error: "Не удалось выполнить действие. Повторите немного позже" }, 503);
}
