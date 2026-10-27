import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "./firebase-admin";
import { activeProfileGuard, limitRequests } from "./api-guard";
import { hasModeratorClaim } from "./security-policy";
import { RequestBodyError } from "./request-body";
import { VerificationError } from "./account-verification-server";
export function verificationJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Authorization",
    },
  });
}
export async function verificationActor(
  request: NextRequest,
  moderator = false,
) {
  const bearer = request.headers.get("authorization") || "";
  if (!bearer.startsWith("Bearer ") || bearer.length > 8192)
    throw new VerificationError("Войдите в аккаунт.", 401);
  let user;
  try {
    user = await getAdminAuth().verifyIdToken(bearer.slice(7).trim(), true);
  } catch (error) {
    throw new VerificationError(
      String((error as { code?: string })?.code || "").startsWith("auth/")
        ? "Сессия недействительна. Войдите снова."
        : "Не удалось проверить сессию. Повторите позже.",
      401,
    );
  }
  if (moderator && !hasModeratorClaim(user))
    throw new VerificationError("Нет прав модератора.", 403);
  const revocation = await getAdminDb()
    .doc(`authRevocations/${user.uid}`)
    .get();
  if (
    revocation.exists &&
    !(Number(user.auth_time) > Number(revocation.get("validAfter")))
  )
    throw new VerificationError("Сессия недействительна. Войдите снова.", 401);
  if (await activeProfileGuard(user.uid))
    throw new VerificationError("Аккаунту недоступно это действие.", 403);
  const limited = limitRequests(
    `verification:${moderator ? "moderator" : "user"}:${request.method}:${user.uid}`,
    request.method === "POST" ? 12 : 60,
  );
  if (limited)
    throw new VerificationError(
      "Слишком много запросов. Подождите минуту.",
      429,
    );
  return user;
}
export function verificationFailure(error: unknown) {
  if (error instanceof VerificationError || error instanceof RequestBodyError)
    return verificationJson({ error: error.message }, error.status);
  console.error("account verification failed", {
    code: String((error as { code?: string })?.code || "server-error").slice(
      0,
      80,
    ),
  });
  return verificationJson(
    { error: "Не удалось выполнить действие. Повторите запрос." },
    503,
  );
}
