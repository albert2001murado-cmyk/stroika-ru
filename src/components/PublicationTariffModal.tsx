"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import TariffPlans from "./TariffPlans";
import type { BillingCatalog } from "@/lib/billing";
import styles from "./PublicationTariff.module.css";

export default function PublicationTariffModal({ open, onClose, initialCatalog, allowCatalogChange, onCatalogChange }: {
  open: boolean; onClose: () => void; initialCatalog: BillingCatalog; allowCatalogChange: boolean;
  onCatalogChange: (catalog: BillingCatalog) => void;
}) {
  const [mounted, setMounted] = useState(false), [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLElement>(null), busyRef = useRef(false);
  busyRef.current = busy;
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open || !mounted) return;
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; dialog.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); if (!busyRef.current) onClose(); }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),summary,[tabindex="0"]') || []).filter(node => node.offsetParent !== null);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keydown); if (previous?.isConnected) previous.focus(); };
  }, [open, mounted, onClose]);
  if (!open || !mounted) return null;
  return createPortal(<div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget && !busyRef.current) onClose(); }}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="publication-tariff-title" tabIndex={-1} className={styles.dialog}>
      <TariffPlans embedded initialCatalog={initialCatalog} allowCatalogChange={allowCatalogChange} onCatalogChange={onCatalogChange} onClose={() => { if (!busyRef.current) onClose(); }} onBusyChange={setBusy}/>
    </section>
  </div>, document.body);
}
