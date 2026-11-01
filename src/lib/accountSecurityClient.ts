"use client";
import { signInWithCustomToken, signInWithEmailAndPassword, type User } from "firebase/auth";
import { auth } from "./firebase";

export class SecurityClientError extends Error {
  constructor(message: string, public code: string, public challenge = "") { super(message); }
}
export type SecurityStatus = { enabled: boolean; sessionValid: boolean; recoveryRemaining: number };
export type Enrollment = { enrollment: string; secret: string; uri: string };
export type SecurityResult = { customToken?: string; recoveryCodes?: string[]; enabled?: boolean };
export async function securityRequest<T>(action: string, body?: Record<string, unknown>, user: User | null = auth.currentUser): Promise<T> {
  let response: Response;
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const token = user ? await user.getIdToken() : "";
    response = await fetch("/api/security/" + action, {
      method: body ? "POST" : "GET",
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: "Bearer " + token } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", signal: controller.signal,
    });
  } catch { throw new SecurityClientError("Не удалось подключиться. Проверьте интернет и повторите", "security/network"); }
  finally { clearTimeout(timer); }
  let result;
  try { result = await response.json(); }
  catch { throw new SecurityClientError("Сервис входа временно недоступен. Повторите позже", "security/unavailable"); }
  if (!response.ok) throw new SecurityClientError(result.error || "Не удалось подтвердить действие", result.code || "security/unavailable");
  return result as T;
}
export async function acceptSecurityResult(result: SecurityResult) {
  if (result.customToken) await signInWithCustomToken(auth, result.customToken);
}
export async function securityLogin(email: string, password: string, remember: boolean) {
  const result = await securityRequest<{ customToken?: string; challenge?: string; legacyFirebaseMfa?: boolean }>("login", { email, password, remember }, null);
  if (result.legacyFirebaseMfa) { await signInWithEmailAndPassword(auth, email, password); return; }
  if (result.challenge) throw new SecurityClientError("Подтвердите вход", "security/mfa-required", result.challenge);
  if (!result.customToken) throw new SecurityClientError("Не удалось войти. Повторите попытку", "security/unavailable");
  await acceptSecurityResult(result);
}
export async function checkAccountSession(user: User) {
  const status = await securityRequest<SecurityStatus>("status", undefined, user);
  if (!status.sessionValid) throw new SecurityClientError("Для защиты аккаунта войдите заново с паролем и кодом", "security/session-expired");
  return status;
}
