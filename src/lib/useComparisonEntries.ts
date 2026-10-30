"use client";
import { useCallback, useEffect, useState } from "react";
import { loadComparisonEntries, type ComparisonEntry } from "./comparisonSelection";
import { auth } from "./firebase";

export function useComparisonEntries(uid: string, ids: string[], active = true) {
  const key = JSON.stringify(ids);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(value => value + 1), []);
  const [state, setState] = useState<{ uid: string; key: string; entries: ComparisonEntry[]; loading: boolean }>({ uid: "", key: "", entries: [], loading: false });
  useEffect(() => {
    if (!uid || !active) return;
    let current = true;
    setState(previous => ({ uid, key, entries: previous.uid === uid && previous.key === key ? previous.entries : [], loading: true }));
    loadComparisonEntries(JSON.parse(key)).then(entries => {
      if (current && auth.currentUser?.uid === uid) setState({ uid, key, entries, loading: false });
    });
    return () => { current = false; };
  }, [uid, key, version, active]);
  const matches = state.uid === uid && state.key === key && auth.currentUser?.uid === uid;
  const entries = matches ? state.entries : [];
  const deadline = entries.reduce((next, item) => item.listing && item.expiresAt && (!next || item.expiresAt < next) ? item.expiresAt : next, 0);
  useEffect(() => {
    if (!active || !deadline) return;
    const timer = setTimeout(refresh, Math.min(2_000_000_000, Math.max(1, deadline - Date.now() + 1)));
    return () => clearTimeout(timer);
  }, [deadline, refresh, active]);
  return { entries, loading: Boolean(uid && ids.length && (!matches || state.loading)), refresh };
}
