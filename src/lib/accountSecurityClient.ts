"use client";
import { signInWithCustomToken, signInWithEmailAndPassword, type User } from "firebase/auth";
import { auth } from "./firebase";
import { AUTH_PROTOCOL, AUTH_RELEASE } from "./account-security-protocol";
import { normalizeRussianPhone } from "./phone";
import { clientErrorCode } from "./clientErrorCode";
import { checkRequestActive, RequestDeadlineError, withRequestDeadline } from "./requestDeadline";

const PHONE_PASSWORD_RELEASE_DATE = "2026-11-22";

export class SecurityClientError extends Error {
  constructor(message: string, public code: string, public challenge = "") { super(message); }
}
export function isSecurityClientError(value: unknown): value is SecurityClientError {
  return Boolean(value && typeof value === "object" &&
    typeof (value as SecurityClientError).code === "string" &&
    (value as SecurityClientError).code.startsWith("security/") &&
    typeof (value as SecurityClientError).message === "string");
}
function deploymentError() {
  return new SecurityClientError("Обновление сервиса входа ещё не завершено. Повторите позже или обратитесь в поддержку", "security/deployment");
}
export type SecurityStatus = { enabled: boolean; sessionValid: boolean; recoveryRemaining: number };
export type Enrollment = { enrollment: string; secret: string; uri: string };
export type SecurityResult = { customToken?: string; recoveryCodes?: string[]; enabled?: boolean };
export async function securityRequest<T>(action: string, body?: Record<string, unknown>, user: User | null = auth.currentUser,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
  try {
    return await withRequestDeadline(options.timeoutMs ?? (action === "login" ? 30_000 : 20_000), async signal => {
      const token = user ? await user.getIdToken() : "";
      checkRequestActive(signal);
      if (user && auth.currentUser?.uid !== user.uid)
        throw new SecurityClientError("Аккаунт изменился. Повторите действие", "security/account-changed");
      const projectId = auth.app.options.projectId || "";
      const response = await fetch("/api/security/" + action, {
        method: body ? "POST" : "GET",
        headers: { Accept: "application/json", "X-Strova-Auth-Client": AUTH_RELEASE,
          "X-Strova-Firebase-Project": projectId,
          ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: "Bearer " + token } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", signal,
      });
      checkRequestActive(signal);
      if (!response.headers.get("content-type")?.includes("application/json") ||
          response.headers.get("x-strova-auth-protocol") !== AUTH_PROTOCOL) throw deploymentError();
      const serverRelease = response.headers.get("x-strova-auth-release") || "";
      if (!response.ok && action === "login" && body?.method === "phone" &&
          /^\d{4}-\d{2}-\d{2}\./.test(serverRelease) &&
          serverRelease.slice(0, 10) < PHONE_PASSWORD_RELEASE_DATE) {
        throw new SecurityClientError(
          "Сервис входа сообщает прежнюю версию. Для входа по телефону обновите сервер. Пока можно войти по почте",
          "security/phone-login-unavailable");
      }
      let result: Record<string, unknown>;
      try { result = await response.json(); }
      catch (error) {
        checkRequestActive(signal);
        throw new SecurityClientError("Сервис входа вернул неполный ответ. Повторите попытку", "security/unavailable");
      }
      checkRequestActive(signal);
      if (!result || typeof result !== "object" || Array.isArray(result)) throw deploymentError();
      if (!response.ok) throw new SecurityClientError(
        typeof result.error === "string" ? result.error.slice(0, 300) : "Не удалось подтвердить действие",
        typeof result.code === "string" ? result.code : "security/unavailable");
      return result as T;
    }, options.signal);
  } catch (error) {
    if (isSecurityClientError(error) || clientErrorCode(error).startsWith("auth/")) throw error;
    if (error instanceof RequestDeadlineError)
      throw new SecurityClientError("Сервис входа не ответил вовремя. Повторите попытку", "security/timeout");
    if (options.signal?.aborted)
      throw new SecurityClientError("Проверка входа отменена", "security/cancelled");
    throw new SecurityClientError("Не удалось подключиться. Проверьте интернет и повторите", "security/network");
  }
}
export async function acceptSecurityResult(result: SecurityResult) {
  if (typeof result.customToken !== "string" || !result.customToken) throw deploymentError();
  try { await signInWithCustomToken(auth, result.customToken); }
  catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "auth/custom-token-mismatch" || code === "auth/invalid-custom-token")
      throw new SecurityClientError("Настройки входа на сайте и сервере не совпадают. Обратитесь в поддержку", "security/project-mismatch");
    throw error;
  }
}
export async function securityLogin(identifier: string, password: string, remember: boolean, method?: "email" | "phone") {
  // Older callers pass three arguments. Keep a phone a phone even when their
  // provider has not yet forwarded the selected method from the screen.
  const phone = normalizeRussianPhone(identifier);
  const selectedMethod = method ?? (!identifier.includes("@") && phone ? "phone" : "email");
  const email = selectedMethod === "email" ? identifier.trim().toLowerCase() : "";
  if (selectedMethod === "phone" && !phone)
    throw new SecurityClientError("Введите номер телефона полностью", "security/invalid-phone");
  if (selectedMethod === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new SecurityClientError("Введите корректную электронную почту", "auth/invalid-email");
  const result = await securityRequest<{ customToken?: string; challenge?: string; legacyFirebaseMfa?: boolean }>("login", {
    method: selectedMethod, ...(selectedMethod === "phone" ? { phone } : { email }), password, remember,
  }, null);
  if (result.legacyFirebaseMfa) {
    if (selectedMethod === "phone") throw new SecurityClientError(
      "Для аккаунта с прежней двухэтапной защитой войдите по почте", "security/email-required");
    await signInWithEmailAndPassword(auth, email, password); return;
  }
  if (result.challenge) {
    if (!/^[a-f0-9]{48}$/.test(result.challenge)) throw deploymentError();
    throw new SecurityClientError("Подтвердите вход", "security/mfa-required", result.challenge);
  }
  if (!result.customToken) throw new SecurityClientError("Не удалось войти. Повторите попытку", "security/unavailable");
  await acceptSecurityResult(result);
}
export async function checkAccountSession(user: User, options: { signal?: AbortSignal } = {}) {
  const status = await securityRequest<SecurityStatus>("status", undefined, user, options);
  if (typeof status.sessionValid !== "boolean" || typeof status.enabled !== "boolean" ||
      !Number.isInteger(status.recoveryRemaining) || status.recoveryRemaining < 0) throw deploymentError();
  if (!status.sessionValid) throw new SecurityClientError("Для защиты аккаунта войдите заново с паролем и кодом", "security/session-expired");
  return status;
}
