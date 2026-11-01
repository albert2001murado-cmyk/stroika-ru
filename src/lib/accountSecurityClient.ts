"use client";
import { signInWithCustomToken, signInWithEmailAndPassword, type User } from "firebase/auth";
import { auth } from "./firebase";
import { AUTH_PROTOCOL, AUTH_RELEASE } from "./account-security-protocol";

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
export async function securityRequest<T>(action: string, body?: Record<string, unknown>, user: User | null = auth.currentUser): Promise<T> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const token = user ? await user.getIdToken() : "";
    const projectId = auth.app.options.projectId || "";
    const response = await fetch("/api/security/" + action, {
      method: body ? "POST" : "GET",
      headers: { Accept: "application/json", "X-Strova-Auth-Client": AUTH_RELEASE,
        "X-Strova-Firebase-Project": projectId,
        ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: "Bearer " + token } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", signal: controller.signal,
    });
    // A proxy 404, HTML error page or old API must never look like a bad password.
    if (!response.headers.get("content-type")?.includes("application/json") ||
        response.headers.get("x-strova-auth-protocol") !== AUTH_PROTOCOL) throw deploymentError();
    let result: Record<string, unknown>;
    try { result = await response.json(); }
    catch (error) {
      if (controller.signal.aborted) throw error;
      throw new SecurityClientError("Сервис входа вернул неполный ответ. Повторите попытку", "security/unavailable");
    }
    if (!result || typeof result !== "object" || Array.isArray(result)) throw deploymentError();
    if (!response.ok) throw new SecurityClientError(
      typeof result.error === "string" ? result.error.slice(0, 300) : "Не удалось подтвердить действие",
      typeof result.code === "string" ? result.code : "security/unavailable");
    return result as T;
  } catch (error) {
    if (isSecurityClientError(error)) throw error;
    if ((error as { code?: string })?.code?.startsWith("auth/")) throw error;
    throw new SecurityClientError("Не удалось подключиться. Проверьте интернет и повторите", "security/network");
  } finally { clearTimeout(timer); }
}
export async function acceptSecurityResult(result: SecurityResult) {
  if (!result.customToken) throw deploymentError();
  try { await signInWithCustomToken(auth, result.customToken); }
  catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "auth/custom-token-mismatch" || code === "auth/invalid-custom-token")
      throw new SecurityClientError("Настройки входа на сайте и сервере не совпадают. Обратитесь в поддержку", "security/project-mismatch");
    throw error;
  }
}
export async function securityLogin(email: string, password: string, remember: boolean) {
  const result = await securityRequest<{ customToken?: string; challenge?: string; legacyFirebaseMfa?: boolean }>("login", { email, password, remember }, null);
  if (result.legacyFirebaseMfa) { await signInWithEmailAndPassword(auth, email, password); return; }
  if (result.challenge) {
    if (!/^[a-f0-9]{48}$/.test(result.challenge)) throw deploymentError();
    throw new SecurityClientError("Подтвердите вход", "security/mfa-required", result.challenge);
  }
  if (!result.customToken) throw new SecurityClientError("Не удалось войти. Повторите попытку", "security/unavailable");
  await acceptSecurityResult(result);
}
export async function checkAccountSession(user: User) {
  const status = await securityRequest<SecurityStatus>("status", undefined, user);
  if (!status.sessionValid) throw new SecurityClientError("Для защиты аккаунта войдите заново с паролем и кодом", "security/session-expired");
  return status;
}
