import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "./firebase-admin";
import { limitRequests } from "./api-guard";
import { hasModeratorClaim } from "./security-policy";
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
  const profile = await getAdminDb().doc(`users/${user.uid}`).get();
  if (!profile.exists || profile.get("moderationStatus") === "blocked")
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
  if (error instanceof VerificationError)
    return verificationJson(
      {
        error: error.message,
        ...(error.retryAt ? { retryAt: error.retryAt } : {}),
      },
      error.status,
    );
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

/** Bound actual bytes before parsing, including requests without Content-Length. */
export async function readVerificationBody(
  request: NextRequest,
  maxBytes = 16_384,
): Promise<Record<string, unknown>> {
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") || "",
    )
  )
    throw new VerificationError("Отправьте данные формы в формате JSON.", 415);
  if (Number(request.headers.get("content-length") || 0) > maxBytes)
    throw new VerificationError("Слишком большой запрос.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new VerificationError("Заполните данные заявки.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const deadline = Date.now() + 30_000;
  try {
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const { value, done } = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new VerificationError(
                "Передача данных заняла слишком много времени. Повторите.",
                408,
              ),
            );
            void reader.cancel();
          }, Math.max(1, deadline - Date.now()));
        }),
      ]).finally(() => {
        if (timer) clearTimeout(timer);
      });
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new VerificationError("Слишком большой запрос.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new VerificationError("Не удалось прочитать данные формы.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new VerificationError("Заполните данные заявки.");
  return body as Record<string, unknown>;
}
