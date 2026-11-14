"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Check, Loader2, PackageOpen, Truck, Wrench, X } from "lucide-react";
import { FREE_CATALOG_INFO, FREE_CATALOGS, type FreeCatalog } from "@/lib/free-placement";
import type { useFreePlacement } from "@/lib/useFreePlacement";

const icons = { materials: PackageOpen, services: Wrench, equipment: Truck, solutions: Building2 };

export default function FreePlacementDialog({ access, initial, onClose, onContinue }: {
  access: ReturnType<typeof useFreePlacement>; initial: FreeCatalog | null;
  onClose: () => void; onContinue: (catalog: FreeCatalog) => void;
}) {
  const [selected, setSelected] = useState(initial);
  const dialog = useRef<HTMLDialogElement>(null);
  const { data, busy, loading, error, refresh, select } = access;
  useEffect(() => {
    const node = dialog.current;
    if (node && !node.open) node.showModal();
    return () => { if (node?.open) node.close(); };
  }, []);
  const current = selected && data?.[selected];
  return <dialog ref={dialog} aria-labelledby="free-placement-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    className="m-auto max-h-[calc(100dvh-24px)] w-[calc(100%-24px)] max-w-[620px] overflow-y-auto rounded-[26px] border border-slate-200 bg-white p-4 text-[#101c34] shadow-2xl backdrop:bg-[#101c34]/45 sm:p-6">
    <header className="flex items-start justify-between gap-3">
      <div><h2 id="free-placement-title" className="text-[23px] font-extrabold leading-tight tracking-tight sm:text-[30px]">Бесплатное размещение</h2>
        <p className="mt-2 text-sm text-slate-600">Выберите каталог для объявления</p></div>
      <button type="button" aria-label="Закрыть" disabled={busy} onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"><X size={19}/></button>
    </header>
    <div className="mt-4 rounded-2xl bg-[#edf4ff] px-4 py-3 sm:mt-5">
      <p className="text-sm font-bold">3 объявления в каждом каталоге</p>
      <p className="mt-1 text-xs leading-5 text-slate-600">Каждое можно один раз продлить на месяц</p>
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 sm:gap-3" aria-label="Каталоги">
      {FREE_CATALOGS.map(catalog => {
        const Icon = icons[catalog], active = selected === catalog, slot = data?.[catalog], exhausted = slot?.remaining === 0;
        return <button key={catalog} type="button" aria-pressed={active} disabled={busy || loading || !slot || exhausted} onClick={() => setSelected(catalog)}
          className={`flex min-h-[68px] items-center gap-3 rounded-2xl border p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-default ${active ? "border-[#0057ff] bg-[#edf4ff]" : "border-slate-200 bg-white enabled:hover:border-blue-400"} ${exhausted ? "opacity-55" : ""}`}>
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#edf4ff] text-[#0057ff]">{active ? <Check size={19}/> : <Icon size={19}/>}</span>
          <span className="min-w-0"><span className="block text-sm font-bold leading-5">{FREE_CATALOG_INFO[catalog].title}</span><span className="block text-xs leading-5 text-slate-600">{exhausted ? "Лимит использован" : slot?.active ? `Доступно ${slot.remaining} из 3` : FREE_CATALOG_INFO[catalog].detail}</span></span>
        </button>;
      })}
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error} {!data && <button type="button" onClick={() => void refresh()} className="font-bold underline">Повторить</button>}</p>}
    <button type="button" disabled={!selected || !current || current.remaining < 1 || busy || loading}
      onClick={() => { if (selected) void select(selected).then(ok => { if (ok) onContinue(selected); }); }}
      className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[#0057ff] px-4 py-2.5 text-sm font-bold text-white enabled:hover:bg-[#004bdd] disabled:bg-slate-200 disabled:text-slate-600">
      {(busy || loading) && <Loader2 size={17} className="motion-safe:animate-spin"/>}{busy ? "Подключаем…" : loading ? "Загружаем каталоги…" : current?.active ? "Продолжить" : "Подключить каталог"}
    </button>
  </dialog>;
}
