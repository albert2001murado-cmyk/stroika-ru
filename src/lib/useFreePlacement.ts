"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { accountRequest } from "./accountClient";
import type { FreeCatalog, FreePlacementState } from "./free-placement";

const route = "/api/publications/access";

export function useFreePlacement(uid?: string) {
  const current = useRef(uid);
  current.current = uid;
  const working = useRef(false);
  const revision = useRef(0);
  const [state, setState] = useState<{ uid: string; data?: FreePlacementState; error?: string; loading?: boolean; busy?: boolean }>({ uid: "" });
  const view = state.uid === uid ? state : null;
  const refresh = useCallback(async () => {
    if (!uid) return null;
    const request = ++revision.current;
    setState(prev => ({ ...(prev.uid === uid ? prev : { uid }), loading: true, error: undefined }));
    try {
      const data = await accountRequest<FreePlacementState>(route);
      if (current.current !== uid || revision.current !== request) return null;
      setState(prev => ({ ...(prev.uid === uid ? prev : { uid }), data, loading: false, error: undefined }));
      return data;
    } catch (error) {
      if (current.current === uid && revision.current === request) setState({ uid, loading: false, error: error instanceof Error ? error.message : "Не удалось загрузить каталоги" });
      return null;
    }
  }, [uid]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function select(catalog: FreeCatalog) {
    if (!uid || !view?.data || view.loading || working.current) return false;
    const slot = view.data[catalog];
    if (!slot || slot.remaining < 1) return false;
    if (slot.active) return true;
    working.current = true;
    ++revision.current;
    setState({ uid, data: view.data, busy: true });
    try {
      const data = await accountRequest<FreePlacementState>(route, { catalog });
      if (current.current !== uid) return false;
      setState({ uid, data });
      return data[catalog]?.active === true && data[catalog].remaining > 0;
    } catch (error) {
      if (current.current === uid) setState({ uid, data: view.data, error: error instanceof Error ? error.message : "Не удалось подключить каталог" });
      return false;
    } finally { working.current = false; }
  }
  async function ensure(catalog: FreeCatalog) {
    const data = await refresh();
    return Boolean(data?.[catalog]?.active && data[catalog].remaining > 0);
  }
  return { data: view?.data, loading: Boolean(uid && (view?.loading || (!view?.data && !view?.error))), busy: Boolean(view?.busy), error: view?.error, refresh, select, ensure };
}
