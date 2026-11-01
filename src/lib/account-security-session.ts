import type { DecodedIdToken } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

export class SecurityError extends Error {
  constructor(message: string, public code: string, public status = 400) { super(message); }
}

/** Shared by EVERY API token check, including moderation, billing and uploads. */
export async function assertAccountSession(db: Firestore, token: DecodedIdToken) {
  const state = (await db.doc("accountSecurity/" + token.uid).get()).data();
  if (!state?.epoch && state?.enabled !== true) return; // Unenrolled accounts keep existing sign-in.
  if (typeof state?.epoch !== "string" || !/^[a-f0-9]{48}$/.test(state.epoch))
    throw new SecurityError("Войдите в аккаунт заново", "security/session-expired", 401);
  const sameEpoch = token.strovaMfaEpoch === state.epoch;
  if (state.enabled === false) {
    if (sameEpoch || (!token.strovaMfaEpoch && token.auth_time > state.validAfter)) return;
    throw new SecurityError("Войдите в аккаунт заново", "security/session-expired", 401);
  }
  if (state.enabled !== true)
    throw new SecurityError("Войдите в аккаунт заново", "security/session-expired", 401);
  const sid = token.strovaMfaSession;
  if (!sameEpoch || typeof sid !== "string" || !/^[a-f0-9]{48}$/.test(sid))
    throw new SecurityError("Подтвердите вход кодом аутентификатора", "security/mfa-required", 401);
  const session = (await db.doc("accountSecuritySessions/" + sid).get()).data();
  if (state.credentialState !== "locked" || !session || session.uid !== token.uid
    || session.epoch !== state.epoch || session.expiresAt.toMillis() <= Date.now())
    throw new SecurityError("Время входа истекло. Войдите заново", "security/session-expired", 401);
}
