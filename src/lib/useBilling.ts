"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { accountRequest, accountMutationRevision } from "./accountClient";
import type { BillingState } from "./billing";
let cachedUid = "", cachedAt = 0;
let cachedRequest: Promise<BillingState> | null = null;
let cachedRevision = -1;
const listeners = new Set<(uid: string, data: BillingState) => void>();
function readBilling(uid: string, force: boolean) {
  if (uid !== cachedUid) { cachedUid = uid; cachedAt = 0; cachedRequest = null; }
  if (!cachedRequest || force || cachedRevision !== accountMutationRevision || Date.now() - cachedAt > 15_000) {
    cachedAt = Date.now();
    cachedRevision = accountMutationRevision;
    const request = accountRequest<BillingState>("/api/billing/state");
    cachedRequest = request;
    void request.then(data => { if (auth.currentUser?.uid === uid && cachedRequest === request) for (const listener of listeners) listener(uid, data); }).catch(() => undefined);
    void request.catch(() => { if (cachedRequest === request) cachedRequest = null; });
  }
  return cachedRequest!;
}
export function useBilling() {
  const [uid, setUid] = useState("");
  const [value, setValue] = useState<{ uid: string; data: BillingState | null; loading: boolean; error: string }>({ uid: "", data: null, loading: true, error: "" });
  const generation = useRef(0);
  useEffect(() => onAuthStateChanged(auth, user => setUid(user?.uid || "")), []);
  useEffect(() => {
    const listener = (accountUid: string, data: BillingState) => {
      if (uid && accountUid === uid && auth.currentUser?.uid === uid) setValue({ uid, data, loading: false, error: "" });
    };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, [uid]);
  const refresh = useCallback(async (force = true) => {
    const current = ++generation.current;
    if (!uid || auth.currentUser?.uid !== uid) return;
    setValue(previous => ({ uid, data: previous.uid === uid ? previous.data : null, loading: true, error: "" }));
    try { const data = await readBilling(uid, force); if (current === generation.current && auth.currentUser?.uid === uid) setValue({ uid, data, loading: false, error: "" }); }
    catch (error) { if (current === generation.current) setValue(previous => ({ uid, data: previous.uid === uid ? previous.data : null, loading: false, error: error instanceof Error ? error.message : "Не удалось загрузить тарифы" })); }
  }, [uid]);
  useEffect(() => { void refresh(false); return () => { generation.current++; }; }, [refresh]);
  return { data: value.uid === uid ? value.data : null, loading: Boolean(uid) && (value.uid !== uid || value.loading), error: value.uid === uid ? value.error : "", refresh };
}
