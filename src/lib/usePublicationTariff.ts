"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useBilling } from "./useBilling";
import { BILLING_CATALOGS, hasPublicationAllowance, type BillingCatalog } from "./billing";

export function usePublicationTariff(catalog: BillingCatalog, enabled = true) {
  const { user } = useAuth(), billing = useBilling(enabled);
  const [open, setOpen] = useState(false), [reason, setReason] = useState<"entry" | "publish" | "limit">("entry");
  const pending = useRef<((granted: boolean) => void) | null>(null);
  const seen = useRef(new Set<string>()), blocked = useRef<{ periodId: string; limit: number } | null>(null);
  const mounted = useRef(true), checking = useRef<Promise<boolean> | null>(null);
  const close = useCallback(() => { setOpen(false); blocked.current = null; const resolve = pending.current; pending.current = null; resolve?.(false); }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; pending.current?.(false); pending.current = null; }; }, []);
  useEffect(() => { close(); seen.current.clear(); }, [user?.uid, close]);
  useEffect(() => {
    if (!enabled || !user || billing.loading || !billing.data) return;
    const key = user.uid + ":" + catalog;
    if (!seen.current.has(key)) {
      seen.current.add(key);
      if (!BILLING_CATALOGS.some(section => hasPublicationAllowance(billing.data, section)) && !open) { blocked.current = null; setReason("entry"); setOpen(true); }
    }
  }, [enabled, user?.uid, catalog, billing.loading, billing.data, open]);
  useEffect(() => {
    if (!open || !hasPublicationAllowance(billing.data, catalog)) return;
    const plan = billing.data?.subscriptions[catalog], old = blocked.current;
    if (old && plan?.periodId === old.periodId && plan.limit <= old.limit) return;
    setOpen(false); blocked.current = null;
    const resolve = pending.current; pending.current = null; resolve?.(true);
  }, [open, catalog, billing.data]);
  const ensure = useCallback(() => {
    if (!enabled) return Promise.resolve(true);
    if (checking.current) return checking.current;
    const request = (async () => {
      if (!user) return false;
      const fresh = await billing.refresh();
      if (!mounted.current) return false;
      if (hasPublicationAllowance(fresh, catalog)) return true;
      blocked.current = null; setReason("publish"); setOpen(true);
      return new Promise<boolean>(resolve => { pending.current?.(false); pending.current = resolve; });
    })();
    checking.current = request;
    const finished = () => { if (checking.current === request) checking.current = null; };
    void request.then(finished, finished);
    return request;
  }, [enabled, user?.uid, catalog, billing.refresh]);
  function handleDenied(error: unknown) {
    const code = (error as { code?: string })?.code;
    if (!["allowance-required", "active-limit"].includes(code || "")) return false;
    const plan = billing.data?.subscriptions[catalog];
    blocked.current = code === "active-limit" && plan ? { periodId: plan.periodId, limit: plan.limit } : null;
    setReason(code === "active-limit" ? "limit" : "publish"); setOpen(true); void billing.refresh(); return true;
  }
  return { billing, ensure, handleDenied, show: () => { blocked.current = null; setReason("publish"); setOpen(true); }, modal: { open, onClose: close, initialCatalog: catalog, allowCatalogChange: reason === "entry" } };
}
