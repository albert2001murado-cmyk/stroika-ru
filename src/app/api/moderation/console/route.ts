import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { activeProfileGuard, limitRequests } from "@/lib/api-guard";
import { hasModeratorClaim } from "@/lib/security-policy";
import { readJsonObject, RequestBodyError } from "@/lib/request-body";
import { loadModerationConsolePage, ModerationConsoleError, updateModerationReport } from "@/lib/moderation-console-server";
import { inspectLocalModerationService } from "@/lib/publication-media-moderation-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Authorization" } });
}

function privateResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Vary", "Authorization");
  return response;
}

async function authorize(request: NextRequest) {
  const limit = limitRequests("moderation/console:total", 180);
  if (limit) return { response: privateResponse(limit) };
  const value = request.headers.get("authorization") || "";
  if (!value.startsWith("Bearer ") || value.length > 8192) return { response: json({ error: "Войдите в аккаунт модератора." }, 401) };
  let user;
  try { user = await getAdminAuth().verifyIdToken(value.slice(7).trim(), true); }
  catch (error) {
    const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "";
    if (code.startsWith("auth/")) return { response: json({ error: "Сессия недействительна. Выйдите и войдите снова." }, 401) };
    return { response: json({ error: "Firebase Admin на сервере не настроен или временно недоступен." }, 503) };
  }
  if (!hasModeratorClaim(user)) return { response: json({ error: "В Firebase Auth этому аккаунту не назначены права модератора. Поля role в профиле недостаточно." }, 403) };
  const inactive = await activeProfileGuard(user.uid);
  if (inactive) return { response: privateResponse(inactive) };
  const userLimit = limitRequests("moderation/console:user:" + user.uid, 90);
  if (userLimit) return { response: privateResponse(userLimit) };
  return { user };
}

function failure(error: unknown) {
  if (error instanceof RequestBodyError || error instanceof ModerationConsoleError) return json({ error: error.message }, error.status);
  console.error("moderation console failed", { code: typeof (error as { code?: unknown })?.code === "string" ? String((error as { code: string }).code).slice(0, 80) : "server-error" });
  return json({ error: "Не получилось выполнить действие модерации. Проверьте соединение сервера с Firebase." }, 503);
}

export async function GET(request: NextRequest) {
  try {
    const access = await authorize(request);
    if (access.response) return access.response;
    const params = request.nextUrl.searchParams;
    if (params.get("kind") === "health") return json(await inspectLocalModerationService());
    const page = await loadModerationConsolePage({ kind: params.get("kind") || "listing", status: params.get("status") || "pending", after: params.get("after") || "", limit: 30 });
    return json(page);
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const access = await authorize(request);
    if (access.response) return access.response;
    const body = await readJsonObject(request, false, 4096);
    const result = await updateModerationReport({ reportId: typeof body.reportId === "string" ? body.reportId : "", action: typeof body.action === "string" ? body.action : "", status: typeof body.status === "string" ? body.status : "" }, access.user!.uid);
    return json(result);
  } catch (error) { return failure(error); }
}
