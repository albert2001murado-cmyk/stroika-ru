import { NextRequest, NextResponse } from "next/server";
import { readVerificationBody } from "@/lib/verification-api-server";
import { SecurityError } from "@/lib/account-security-session";
import {
  beginSecurityEnrollment, completeSecurityLogin, finishSecurityEnrollment, manageSecurity,
  endSecuritySession, securityActor, securityRate, securityStatus, startSecurityLogin,
} from "@/lib/account-security-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", Vary: "Authorization, Origin", "X-Content-Type-Options": "nosniff", ...(status === 429 ? { "Retry-After": "600" } : {}) },
});
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  // Native clients do not send Origin. No cookies authenticate these APIs.
  if (!origin) return;
  const allowed = new Set([new URL(request.url).origin, process.env.STROVA_PUBLIC_ORIGIN, "https://strovaru.ru", "https://www.strovaru.ru"].filter(Boolean));
  if (!allowed.has(origin)) throw new SecurityError("Недопустимый источник запроса", "security/origin", 403);
}
function failure(error: unknown) {
  if (error instanceof SecurityError) return json({ error: error.message, code: error.code }, error.status);
  const status = Number((error as { status?: number })?.status);
  if ([400, 408, 413, 415].includes(status))
    return json({ error: "Не удалось прочитать запрос. Повторите действие", code: "security/request" }, status);
  console.error("Account security failed", { code: String((error as { code?: string })?.code || "internal").slice(0, 80) });
  return json({ error: "Не удалось подтвердить действие. Повторите попытку", code: "security/unavailable" }, 503);
}
type Context = { params: Promise<{ action: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    if ((await context.params).action !== "status") return json({ error: "Не найдено" }, 404);
    return json(await securityStatus(await securityActor(request)));
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    sameOrigin(request);
    const action = (await context.params).action;
    if (!["login", "challenge", "begin", "finish", "manage", "logout"].includes(action)) return json({ error: "Не найдено" }, 404);
    // Trust forwarding headers ONLY after the reverse proxy is configured to replace them.
    const ip = process.env.STROVA_TRUST_PROXY_HEADERS === "true"
      ? (request.headers.get("x-forwarded-for") || "").split(",")[0].trim().slice(0, 80) : "shared";
    await securityRate("entry:" + ip, 100, 60_000);
    const body = await readVerificationBody(request, 4096);
    if (action === "login") return json(await startSecurityLogin(body));
    if (action === "challenge") return json(await completeSecurityLogin(body));
    const actor = await securityActor(request);
    if (action === "logout") return json(await endSecuritySession(actor));
    if (action === "begin") return json(await beginSecurityEnrollment(actor, body));
    if (action === "finish") return json(await finishSecurityEnrollment(actor, body));
    return json(await manageSecurity(actor, body));
  } catch (error) { return failure(error); }
}
