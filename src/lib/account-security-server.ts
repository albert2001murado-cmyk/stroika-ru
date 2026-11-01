import { randomBytes } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb, getRawAdminAuth } from "./firebase-admin";
import { assertAccountSession, SecurityError } from "./account-security-session";
import {
  assertSecurityConfigured, checkPassword, decryptSecret, digest, encryptSecret, hashPassword,
  newRecoveryCodes, newTotp, opaqueId, recoveryDigest, safeEqual, totpCounter, validPassword,
} from "./account-security-crypto";

const CHALLENGE_MS = 5 * 60_000, ENROLL_MS = 10 * 60_000, LOCK_MS = 10 * 60_000;
const stateRef = (uid: string) => getAdminDb().doc("accountSecurity/" + uid);
const invalidLogin = () => new SecurityError("Проверьте почту и пароль", "auth/invalid-credential", 401);
const invalidCode = () => new SecurityError("Код не подошёл или уже использован. Введите новый код", "security/invalid-code");
const expired = () => new SecurityError("Время подтверждения истекло. Войдите заново", "security/session-expired", 401);
const tooMany = () => new SecurityError("Слишком много попыток. Повторите через 10 минут", "security/too-many-requests", 429);

/** Durable limits survive process restarts and apply across all server replicas. */
export async function securityRate(key: string, maximum: number, windowMs = LOCK_MS) {
  const ref = getAdminDb().doc("accountSecurityLimits/" + digest(key)), now = Date.now();
  const accepted = await getAdminDb().runTransaction(async tx => {
    const snapshot = await tx.get(ref), previous = snapshot.data();
    const count = previous && previous.until.toMillis() > now ? Number(previous.count) : 0;
    if (count >= maximum) return false;
    tx.set(ref, { count: count + 1, until: Timestamp.fromMillis(count ? previous!.until.toMillis() : now + windowMs) });
    return true;
  });
  if (!accepted) throw tooMany();
}
export async function securityActor(request: Request) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ") || header.length > 8192) throw expired();
  let actor: DecodedIdToken;
  try { actor = await getRawAdminAuth().verifyIdToken(header.slice(7).trim(), true); }
  catch { throw expired(); }
  const [profile, revocation] = await Promise.all([
    getAdminDb().doc("users/" + actor.uid).get(), getAdminDb().doc("authRevocations/" + actor.uid).get(),
  ]);
  if (profile.exists && profile.get("moderationStatus") === "blocked")
    throw new SecurityError("Аккаунту недоступно это действие", "security/blocked", 403);
  if (revocation.exists && !(actor.auth_time > Number(revocation.get("validAfter")))) throw expired();
  return actor;
}
export async function securityStatus(actor: DecodedIdToken) {
  const state = (await stateRef(actor.uid).get()).data();
  let sessionValid = true;
  try { await assertAccountSession(getAdminDb(), actor); } catch { sessionValid = false; }
  return { enabled: state?.enabled === true, sessionValid, recoveryRemaining: sessionValid && state?.enabled ? state.recoveryHashes?.length || 0 : 0 };
}
export async function endSecuritySession(actor: DecodedIdToken) {
  const sid = actor.strovaMfaSession;
  if (typeof sid === "string" && /^[a-f0-9]{48}$/.test(sid)) {
    const ref = getAdminDb().doc("accountSecuritySessions/" + sid);
    await getAdminDb().runTransaction(async tx => {
      const state = (await tx.get(ref)).data();
      if (state?.uid === actor.uid) tx.delete(ref);
    });
  }
  return { ended: true };
}

/** The existing Firebase email/password provider remains available on Spark.
 * A real password reset can restore the first factor, never the second factor.
 * Do not log this body or a provider's response.
 */
async function firebasePassword(email: string, password: string) {
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!key) throw new SecurityError("Вход ещё не настроен на сервере", "security/not-configured", 503);
  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (emulator && process.env.NODE_ENV === "production") throw new Error("security/emulator-in-production");
  const base = emulator ? "http://" + emulator + "/identitytoolkit.googleapis.com" : "https://identitytoolkit.googleapis.com";
  let response: Response;
  try {
    response = await fetch(base + "/v1/accounts:signInWithPassword?key=" + encodeURIComponent(key), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }), signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch { throw new SecurityError("Не удалось проверить пароль. Проверьте соединение", "security/unavailable", 503); }
  const result = await response.json();
  if (result.mfaPendingCredential) return { legacyMfa: true as const, uid: "" };
  if (!response.ok) {
    const code = result?.error?.message || "";
    if (/^(INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|USER_DISABLED)/.test(code)) return null;
    if (code.includes("TOO_MANY_ATTEMPTS")) throw tooMany();
    throw new SecurityError("Не удалось проверить пароль. Повторите позже", "security/unavailable", 503);
  }
  const token = await getRawAdminAuth().verifyIdToken(result.idToken, true);
  return { legacyMfa: false as const, uid: token.uid };
}
async function liveUser(uid: string) {
  const user = await getRawAdminAuth().getUser(uid);
  const profile = await getAdminDb().doc("users/" + uid).get();
  if (user.disabled || profile.get("moderationStatus") === "blocked") throw invalidLogin();
  return user;
}
async function mintSession(uid: string, epoch: string, enabled: boolean, remember = true) {
  const user = await liveUser(uid);
  // Preserve moderator/admin claims, but never persist a global "MFA passed" flag.
  const claims = { ...user.customClaims, strovaMfaEpoch: epoch } as Record<string, unknown>;
  delete claims.strovaMfaSession;
  if (enabled) {
    const sid = opaqueId();
    const expiresAt = Timestamp.fromMillis(Date.now() + (remember ? 30 * 24 : 12) * 60 * 60_000);
    await getAdminDb().doc("accountSecuritySessions/" + sid).set({ uid, epoch, expiresAt, createdAt: Timestamp.now() });
    claims.strovaMfaSession = sid;
  }
  return { customToken: await getRawAdminAuth().createCustomToken(uid, claims) };
}
export async function startSecurityLogin(body: Record<string, unknown>) {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !validPassword(body.password)) throw invalidLogin();
  await securityRate("password:" + email, 12);
  let user;
  try { user = await getRawAdminAuth().getUserByEmail(email); }
  catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") { await hashPassword(body.password); throw invalidLogin(); }
    throw error;
  }
  await liveUser(user.uid);
  const state = (await stateRef(user.uid).get()).data();
  if (!state?.enabled) {
    const provider = await firebasePassword(email, body.password);
    if (provider?.legacyMfa) return { legacyFirebaseMfa: true };
    if (!provider || provider.uid !== user.uid) throw invalidLogin();
    return mintSession(user.uid, state?.epoch || "", false);
  }
  assertSecurityConfigured();
  const ownPassword = await checkPassword(body.password, state.passwordHash || "");
  // Do not submit the intentionally locked Firebase password on every ordinary
  // MFA login: those failed checks would trigger Firebase's own throttling.
  const provider = ownPassword ? null : await firebasePassword(email, body.password);
  const resetPassword = ownPassword
    ? user.tokensValidAfterTime !== state.firebaseValidAfter
    : Boolean(provider && !provider.legacyMfa && provider.uid === user.uid);
  if (!ownPassword && !resetPassword) throw invalidLogin();
  // Detect a lost/replaced deployment key before issuing a challenge or spending
  // factor attempts. Never rotate the key or silently disable an enrolled account.
  decryptSecret(user.uid, state.secret);
  const id = opaqueId();
  await getAdminDb().doc("accountSecurityChallenges/" + digest(id)).set({
    uid: user.uid, epoch: state.epoch, attempts: 0, expiresAt: Timestamp.fromMillis(Date.now() + CHALLENGE_MS),
    remember: body.remember !== false, ...(resetPassword ? { nextPasswordHash: ownPassword ? state.passwordHash : await hashPassword(body.password) } : {}),
  });
  return { challenge: id };
}

/** Factor use and consumption happen in the SAME transaction as the protected action. */
function factorChange(uid: string, state: Record<string, any>, code: string, now: number) {
  if (state.lockedUntil?.toMillis() > now) return { error: tooMany() };
  if (/^\d{6}$/.test(code)) {
    const counter = totpCounter(decryptSecret(uid, state.secret), code, now);
    if (counter !== null && counter > Number(state.lastCounter ?? -1))
      return { update: { lastCounter: counter, failures: 0, lockedUntil: FieldValue.delete() } };
  } else {
    const normalized = code.toUpperCase().replace(/[-\s]/g, "");
    if (/^[A-F0-9]{24}$/.test(normalized)) {
      const hash = recoveryDigest(uid, normalized), hashes: string[] = state.recoveryHashes || [];
      if (hashes.some(item => safeEqual(item, hash)))
        return { update: { recoveryHashes: hashes.filter(item => !safeEqual(item, hash)), failures: 0, lockedUntil: FieldValue.delete() } };
    }
  }
  const failures = Number(state.failures || 0) + 1;
  return { error: invalidCode(), update: { failures, ...(failures >= 5 ? { lockedUntil: Timestamp.fromMillis(now + LOCK_MS), failures: 0 } : {}) } };
}

/** Randomize Firebase's password: knowing the first factor cannot call the raw Auth API.
 * If this network step fails, the account remains gated and the next MFA login repairs it.
 */
async function lockFirebaseCredential(uid: string, epoch: string) {
  await getRawAdminAuth().updateUser(uid, { password: randomBytes(48).toString("base64url") });
  await getRawAdminAuth().revokeRefreshTokens(uid);
  const firebaseUser = await getRawAdminAuth().getUser(uid);
  await getAdminDb().runTransaction(async tx => {
    const ref = stateRef(uid), state = (await tx.get(ref)).data();
    if (!state?.enabled || state.epoch !== epoch) throw expired();
    tx.update(ref, { credentialState: "locked", firebaseValidAfter: firebaseUser.tokensValidAfterTime || "" });
  });
}

export async function completeSecurityLogin(body: Record<string, unknown>) {
  const id = typeof body.challenge === "string" ? body.challenge : "";
  const code = typeof body.code === "string" && body.code.length <= 48 ? body.code.trim() : "";
  if (!/^[a-f0-9]{48}$/.test(id)) throw expired();
  const ref = getAdminDb().doc("accountSecurityChallenges/" + digest(id));
  const result = await getAdminDb().runTransaction(async tx => {
    const challenge = (await tx.get(ref)).data(), now = Date.now();
    if (!challenge || challenge.expiresAt.toMillis() <= now || challenge.consumed || challenge.attempts >= 5)
      return { error: expired() };
    const security = stateRef(challenge.uid), state = (await tx.get(security)).data();
    if (!state?.enabled || state.epoch !== challenge.epoch) return { error: expired() };
    if (state.credentialState === "disabling" && state.credentialOperationUntil?.toMillis() > now)
      return { error: new SecurityError("Изменение защиты ещё выполняется. Повторите через минуту", "security/busy", 409) };
    const factor = factorChange(challenge.uid, state, code, now);
    if (factor.error) {
      tx.update(ref, { attempts: Number(challenge.attempts) + 1 });
      if (factor.update) tx.update(security, factor.update);
      return { error: factor.error };
    }
    const reset = Boolean(challenge.nextPasswordHash), epoch = reset ? opaqueId() : state.epoch;
    tx.update(security, {
      ...factor.update, ...(reset ? { passwordHash: challenge.nextPasswordHash, epoch, credentialState: "locking", validAfter: Math.floor(now / 1000) } : {}),
    });
    tx.update(ref, { consumed: true, nextPasswordHash: FieldValue.delete() });
    return { uid: challenge.uid as string, epoch: epoch as string, remember: challenge.remember !== false, lock: reset || state.credentialState !== "locked" };
  });
  if (result.error) throw result.error;
  if (result.lock) await lockFirebaseCredential(result.uid!, result.epoch!);
  return mintSession(result.uid!, result.epoch!, true, result.remember);
}

export async function beginSecurityEnrollment(actor: DecodedIdToken, body: Record<string, unknown>) {
  assertSecurityConfigured();
  await securityRate("manage:" + actor.uid, 12);
  const user = await liveUser(actor.uid), ref = stateRef(actor.uid);
  if (!user.emailVerified || !user.email)
    throw new SecurityError("Сначала подтвердите электронную почту", "auth/unverified-email");
  if (!validPassword(body.password)) throw invalidLogin();
  const provider = await firebasePassword(user.email, body.password);
  if (!provider || provider.uid !== actor.uid || provider.legacyMfa) throw invalidLogin();
  const totp = newTotp(user.email), id = opaqueId(), passwordHash = await hashPassword(body.password);
  await getAdminDb().runTransaction(async tx => {
    const state = (await tx.get(ref)).data();
    if (state?.enabled) throw new SecurityError("Защита уже включена. Войдите заново", "security/already-enabled", 409);
    tx.set(ref, { pending: { id: digest(id), secret: encryptSecret(actor.uid, totp.secret.base32), passwordHash, attempts: 0, expiresAt: Timestamp.fromMillis(Date.now() + ENROLL_MS) } }, { merge: true });
  });
  return { enrollment: id, secret: totp.secret.base32, uri: totp.toString() };
}
export async function finishSecurityEnrollment(actor: DecodedIdToken, body: Record<string, unknown>) {
  const id = typeof body.enrollment === "string" ? body.enrollment : "";
  if (!/^[a-f0-9]{48}$/.test(id)) throw expired();
  const code = typeof body.code === "string" ? body.code : "", recovery = newRecoveryCodes(actor.uid), epoch = opaqueId();
  const result = await getAdminDb().runTransaction(async tx => {
    const ref = stateRef(actor.uid), state = (await tx.get(ref)).data(), pending = state?.pending, now = Date.now();
    if (state?.enabled || !pending || pending.id !== digest(id) || pending.expiresAt.toMillis() <= now || pending.attempts >= 5) return expired();
    const counter = totpCounter(decryptSecret(actor.uid, pending.secret), code, now);
    if (counter === null) { tx.update(ref, { "pending.attempts": Number(pending.attempts) + 1 }); return invalidCode(); }
    tx.set(ref, {
      enabled: true, epoch, secret: pending.secret, passwordHash: pending.passwordHash, recoveryHashes: recovery.hashes,
      lastCounter: counter, failures: 0, credentialState: "locking", validAfter: Math.floor(now / 1000), enabledAt: Timestamp.fromMillis(now),
    });
    return null;
  });
  if (result) throw result;
  await lockFirebaseCredential(actor.uid, epoch);
  return { ...await mintSession(actor.uid, epoch, true), recoveryCodes: recovery.codes };
}

export async function manageSecurity(actor: DecodedIdToken, body: Record<string, unknown>) {
  await assertAccountSession(getAdminDb(), actor);
  await securityRate("manage:" + actor.uid, 12);
  const state = (await stateRef(actor.uid).get()).data();
  if (!state?.enabled || !validPassword(body.password) || !await checkPassword(body.password, state.passwordHash || "")) throw invalidLogin();
  const action = body.action, code = typeof body.code === "string" && body.code.length <= 48 ? body.code : "";
  if (!["disable", "recovery", "reauthenticate"].includes(String(action))) throw new SecurityError("Неизвестное действие", "security/action");
  const recovery = newRecoveryCodes(actor.uid);
  const result = await getAdminDb().runTransaction(async tx => {
    const ref = stateRef(actor.uid), current = (await tx.get(ref)).data(), now = Date.now();
    if (!current?.enabled || current.epoch !== state.epoch || current.passwordHash !== state.passwordHash) return { error: expired() };
    const factor = factorChange(actor.uid, current, code, now);
    if (factor.update) tx.update(ref, factor.update);
    if (factor.error) return { error: factor.error };
    // Consume the factor before any subsequent Firebase mutation; retries need a fresh code.
    if (action === "recovery") tx.update(ref, { recoveryHashes: recovery.hashes });
    if (action === "disable") tx.update(ref, { credentialState: "disabling", credentialOperationUntil: Timestamp.fromMillis(now + 60_000) });
    return { epoch: current.epoch as string };
  });
  if (result.error) throw result.error;
  if (action === "disable") {
    await getRawAdminAuth().updateUser(actor.uid, { password: body.password });
    const epoch = opaqueId();
    await getAdminDb().runTransaction(async tx => {
      const ref = stateRef(actor.uid), current = (await tx.get(ref)).data();
      if (current?.epoch !== result.epoch || current.credentialState !== "disabling") throw expired();
      tx.set(ref, { enabled: false, epoch, validAfter: Math.floor(Date.now() / 1000), disabledAt: Timestamp.now() });
    });
    return { ...await mintSession(actor.uid, epoch, false), enabled: false };
  }
  if (action === "reauthenticate") return mintSession(actor.uid, result.epoch!, true);
  return { recoveryCodes: recovery.codes };
}
