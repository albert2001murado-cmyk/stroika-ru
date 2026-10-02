"use client";

import { useRef, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { publicationShareUrl } from "@/lib/publicationShare";

export default function SharePublicationButton({ kind, id, title }: { kind: "listing" | "request"; id: string; title: string }) {
  const busy = useRef(false);
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);
  const url = publicationShareUrl(kind, id);
  async function share() {
    if (busy.current) return;
    busy.current = true;
    setCopied(false);
    setFallback(false);
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare({ title, url }))) {
        try { await navigator.share({ title, url }); return; }
        catch (error) { if (error instanceof Error && error.name === "AbortError") return; }
      }
      if (navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(url); setCopied(true); return; } catch { /* Show a selectable link. */ }
      }
      setFallback(true);
    } finally { busy.current = false; }
  }
  return <div className="my-3 max-w-full">
    <button type="button" onClick={share} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-blue-100 bg-white px-4 py-2.5 text-sm font-bold text-blue-600 shadow-sm transition hover:bg-blue-50 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 motion-reduce:transform-none">
      {copied ? <Check size={18} aria-hidden /> : <Share2 size={18} aria-hidden />}{copied ? "Ссылка скопирована" : "Поделиться"}
    </button>
    <span className="sr-only" role="status">{copied ? "Ссылка на объявление скопирована" : ""}</span>
    {fallback ? <label className="mt-2 block text-sm font-medium text-slate-700 rounded-xl bg-white p-3">Скопируйте ссылку на объявление
      <input readOnly value={url} onFocus={event => event.target.select()} aria-label="Ссылка на объявление" className="mt-2 block w-full min-w-0 rounded-lg border border-slate-200 p-2 text-sm" />
    </label> : null}
  </div>;
}
