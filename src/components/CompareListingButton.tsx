"use client";
import { useState } from "react";
import { Check, GitCompareArrows, Loader2 } from "lucide-react";
import Link from "next/link";
import { useListingComparison } from "@/lib/useListingComparison";

export default function CompareListingButton({ id }: { id: string }) {
  const { uid, ids, ready, change, error: selectionError } = useListingComparison();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selected = ids.includes(id);
  if (!uid) return <Link href="/auth" className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-blue-100 px-4 py-3 text-sm font-bold text-[#0057ff]"><GitCompareArrows size={18} />Сравнить анкету</Link>;
  if (selected) return <Link href="/compare" className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#eaf2ff] px-4 py-3 text-sm font-bold text-[#0057ff]"><Check size={18} />В сравнении · {ids.length}/3</Link>;
  return <div>
    <button type="button" disabled={saving || !ready} onClick={async () => {
      setSaving(true); setError("");
      try { await change("add", id); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить сравнение"); } finally { setSaving(false); }
    }} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold text-[#0057ff] transition hover:bg-blue-50 active:scale-[.98] disabled:opacity-50">
      {saving ? <Loader2 size={18} className="animate-spin" /> : <GitCompareArrows size={18} />}Сравнить анкету
    </button>
    {error || selectionError ? <p role="alert" className="mt-2 max-w-sm text-sm text-red-600">{error || selectionError} <Link href="/compare" className="underline">Открыть сравнение</Link></p> : null}
  </div>;
}
