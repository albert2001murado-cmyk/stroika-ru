"use client";
import { useState } from "react";
import { getMultiFactorResolver, TotpMultiFactorGenerator, type MultiFactorError, type MultiFactorResolver } from "firebase/auth";
import { auth } from "./firebase";
import { acceptSecurityResult, securityRequest, isSecurityClientError, type SecurityResult } from "./accountSecurityClient";
export function mfaMessage(error: unknown) {
  if (isSecurityClientError(error)) return error.message;
  const code = (error as { code?: string })?.code || "";
  if (code.includes("invalid-verification-code")) return "Код не подошёл. Проверьте время на телефоне и введите новый код";
  if (code.includes("session-expired") || code.includes("invalid-multi-factor-session")) return "Время подтверждения истекло. Войдите заново";
  if (code.includes("requires-recent-login")) return "Подтвердите текущий пароль ещё раз";
  if (code.includes("unverified-email")) return "Сначала подтвердите электронную почту";
  if (code.includes("wrong-password") || code.includes("invalid-credential")) return "Проверьте текущий пароль";
  if (code.includes("too-many-requests")) return "Слишком много попыток. Повторите немного позже";
  if (code.includes("network-request-failed")) return "Не удалось подключиться. Проверьте интернет";
  return "Не удалось подтвердить действие. Повторите попытку";
}
export function useMfaChallenge() {
  const [resolver, setResolver] = useState<MultiFactorResolver | { challenge: string } | null>(null);
  const [code, setRawCode] = useState(""), [recovery, setRecovery] = useState(false);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  function capture(value: unknown) {
    if (isSecurityClientError(value) && value.code === "security/mfa-required" && /^[a-f0-9]{48}$/.test(value.challenge || "")) {
      setResolver({ challenge: value.challenge });
    } else if ((value as { code?: string })?.code === "auth/multi-factor-auth-required") {
      setResolver(getMultiFactorResolver(auth, value as MultiFactorError));
    } else return false;
    setRawCode(""); setRecovery(false); setError(""); return true;
  }
  const own = resolver !== null && "challenge" in resolver;
  const valid = recovery && own ? /^[A-F0-9]{24}$/.test(code.replace(/[-\s]/g, "")) : /^\d{6}$/.test(code);
  async function confirm(done: () => void | Promise<void>) {
    if (busy || !resolver || !valid) return;
    setBusy(true); setError("");
    try {
      if ("challenge" in resolver) {
        const result = await securityRequest<SecurityResult>("challenge", { challenge: resolver.challenge, code }, null);
        await acceptSecurityResult(result);
      } else {
        const hint = resolver.hints.find(h => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
        if (!hint) throw new Error("unsupported");
        await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code));
      }
      setResolver(null); setRawCode(""); await done();
    } catch (e) { setRawCode(""); setError((e as Error).message === "unsupported" ? "Этот второй фактор не поддерживается. Обратитесь в поддержку" : mfaMessage(e)); }
    finally { setBusy(false); }
  }
  function cancel() { setResolver(null); setRawCode(""); setError(""); setRecovery(false); }
  function toggleRecovery() { setRecovery(v => !v); setRawCode(""); setError(""); }
  return { resolver, code, setCode: (v: string) => setRawCode(recovery ? v.toUpperCase().replace(/[^A-F0-9-]/g, "").slice(0, 29) : v.replace(/\D/g, "").slice(0, 6)), error, busy, capture, confirm, cancel, recovery, toggleRecovery, recoveryAvailable: own, valid };
}
