"use client";
import { useEffect, useState } from "react";
import { onIdTokenChanged, reload, sendEmailVerification } from "firebase/auth";
import { auth } from "./firebase";
import { acceptSecurityResult, securityRequest, type Enrollment, type SecurityResult, type SecurityStatus } from "./accountSecurityClient";
import { mfaMessage } from "./useMfaChallenge";
export function useAccountSecurity() {
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid || null);
  const [verified, setVerified] = useState(false), [enabled, setEnabled] = useState(false), [ready, setReady] = useState(false);
  const [password, setPassword] = useState(""), [code, setCode] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null), [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [remaining, setRemaining] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  async function sync() {
    const user = auth.currentUser;
    if (!user) return;
    const status = await securityRequest<SecurityStatus>("status", undefined, user);
    if (auth.currentUser?.uid !== user.uid) return;
    setVerified(user.emailVerified); setEnabled(status.enabled); setRemaining(status.recoveryRemaining); setReady(status.sessionValid);
  }
  useEffect(() => {
    let active = true, lastUid = auth.currentUser?.uid;
    const unsubscribe = onIdTokenChanged(auth, user => {
      if (!active) return;
      setUid(user?.uid || null);
      if (lastUid !== user?.uid) { setPassword(""); setCode(""); setEnrollment(null); setRecoveryCodes([]); setReady(false); setError(""); setMessage(""); }
      lastUid = user?.uid;
      if (user) void sync().catch(e => { if (active) { setReady(false); setError(mfaMessage(e)); } });
      else { setEnabled(false); setVerified(false); setReady(false); }
    });
    return () => { active = false; unsubscribe(); };
  }, []);
  async function execute(run: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try { await run(); } catch (e) { setError(mfaMessage(e)); }
    finally { setBusy(false); }
  }
  async function apply(result: SecurityResult) {
    await acceptSecurityResult(result);
    setPassword(""); setCode(""); setEnrollment(null);
    setRecoveryCodes(result.recoveryCodes || []);
    await sync();
  }
  const begin = () => execute(async () => {
    const result = await securityRequest<Enrollment>("begin", { password });
    setPassword(""); setEnrollment(result); setCode("");
  });
  const finish = () => execute(async () => {
    if (!enrollment) return;
    const result = await securityRequest<SecurityResult>("finish", { enrollment: enrollment.enrollment, code });
    await apply(result); setMessage("Защита включена. Сохраните резервные коды отдельно от телефона");
  });
  const manage = (action: "disable" | "recovery") => execute(async () => {
    const result = await securityRequest<SecurityResult>("manage", { action, password, code });
    await apply(result);
    setMessage(action === "disable" ? "Двухэтапный вход отключён" : "Созданы новые резервные коды. Старые больше не действуют");
  });
  return {
    uid, email: auth.currentUser?.email || "", verified, enabled, ready, remaining,
    password, setPassword, code, setCode: (v: string) => setCode(v.toUpperCase().replace(/[^A-F0-9-]/g, "").slice(0, 29)),
    secret: enrollment?.secret || "", uri: enrollment?.uri || "", recoveryCodes,
    busy, error, message, begin, finish, disable: () => manage("disable"), regenerate: () => manage("recovery"),
    cancel: () => { setEnrollment(null); setCode(""); setPassword(""); setError(""); },
    dismissCodes: () => { setRecoveryCodes([]); setMessage(""); }, retry: () => execute(sync),
    sendVerification: () => execute(async () => { if (auth.currentUser) { auth.languageCode = "ru"; await sendEmailVerification(auth.currentUser); setMessage("Письмо отправлено. После подтверждения вернитесь сюда"); } }),
    checkVerification: () => execute(async () => { if (auth.currentUser) { await reload(auth.currentUser); await auth.currentUser.getIdToken(true); await sync(); } }),
  };
}
