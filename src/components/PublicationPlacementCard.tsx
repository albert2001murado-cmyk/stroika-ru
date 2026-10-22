"use client";
import { CalendarDays, Clock3, Loader2, RotateCcw } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { publicationTermDisplay } from "@/lib/publication-lifetime";
import { isPublicationOwner } from "@/lib/publication-owner";
import { usePublicationClock } from "@/lib/usePublicationExpiry";
import { usePublicationRenewal } from "@/lib/usePublicationRenewal";
import type { PublicationKind } from "@/lib/renewPublication";

type Props = {
  kind: PublicationKind; publicationId: string; publication: unknown;
};

export default function PublicationPlacementCard(props: Props) {
  const { user } = useAuth();
  if (!isPublicationOwner(props.publication, user?.uid, props.kind)) return null;
  return <OwnedPublicationPlacementCard {...props} />;
}

function OwnedPublicationPlacementCard({ kind, publicationId, publication }: Props) {
  const renewal = usePublicationRenewal(kind, publicationId, publication);
  usePublicationClock([renewal.publication], 60_000);
  const term = publicationTermDisplay(renewal.publication);
  const tone = term.expired ? "border-slate-200 bg-slate-50" : term.endingSoon ? "border-amber-200 bg-amber-50/70" : "border-blue-100 bg-blue-50/60";
  return <section aria-label="Срок размещения объявления" className={`mt-3 rounded-[22px] border p-4 sm:p-5 ${tone}`}>
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#1457b9] ring-1 ring-black/5"><CalendarDays size={20} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-slate-500">{term.expired ? "Срок размещения истёк" : "Месяц размещения"}</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-600">{term.expired ? "Объявление сохранено в профиле" : term.countdown}</p>
      </div>
    </div>
    {term.deadline > 0 ? <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <div><p className="text-xs font-semibold text-slate-500">{term.expired ? "Завершилось" : "Истекает"}</p><p className="mt-1 text-xl font-extrabold tracking-[-0.02em] text-[#164b93] sm:text-[22px]">{term.date}</p></div>
      <p className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600"><Clock3 size={14} aria-hidden="true" />{term.time}</p>
    </div> : null}
    {!term.expired && term.deadline > 0 ? <div className="mt-4 h-1 overflow-hidden rounded-full bg-white" aria-hidden="true"><div className={`h-full rounded-full ${term.endingSoon ? "bg-amber-400" : "bg-[#3d7be0]"}`} style={{ width: `${term.remainingPercent}%` }} /></div> : null}
    {term.expired ? <div className="mt-4">
      <button type="button" onClick={renewal.renew} disabled={renewal.busy} aria-busy={renewal.busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#0057ff] px-4 py-3 text-sm font-extrabold text-white transition hover:bg-[#004de6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-65">
        {renewal.busy ? <Loader2 size={18} className="animate-spin" /> : <RotateCcw size={18} />}{renewal.busy ? "Отправляем…" : "Опубликовать снова"}
      </button>
      <p className="mt-2 text-center text-xs leading-5 text-slate-500">На новый месяц · с проверкой объявления</p>
    </div> : null}
    {renewal.error ? <p role="alert" className="mt-3 text-sm font-semibold leading-6 text-red-600">{renewal.error}</p> : null}
  </section>;
}
