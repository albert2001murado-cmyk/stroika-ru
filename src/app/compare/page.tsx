"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BadgeCheck, BriefcaseBusiness, GitCompareArrows, Loader2, Plus, RefreshCw, Star, Trash2, X } from "lucide-react";
import { useListingComparison } from "@/lib/useListingComparison";
import { useComparisonEntries } from "@/lib/useComparisonEntries";
import { COMPARISON_ROWS } from "@/lib/listingComparison";

export default function ComparePage() {
  const { uid, ids, ready, error, change } = useListingComparison();
  const { entries, loading, refresh } = useComparisonEntries(uid, ids);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  async function update(action: "remove" | "clear", id?: string) {
    setSaving(true); setSaveError("");
    try { await change(action, id); } catch (cause) { setSaveError(cause instanceof Error ? cause.message : "Не удалось сохранить сравнение"); } finally { setSaving(false); }
  }
  return <main className="app-page pb-12"><div className="app-container max-w-6xl">
    <section className="rounded-[28px] bg-[#0057ff] p-5 text-white sm:p-8">
      <div className="mb-8 flex items-center justify-between gap-4"><Link href="/profile" aria-label="Назад в профиль" className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15"><ArrowLeft size={20} /></Link><span className="text-[11px] font-bold tracking-[.2em]">МОЙ ВЫБОР</span><span className="text-sm font-bold">{ids.length} / 3</span></div>
      <div className="flex items-start gap-4"><GitCompareArrows size={30} className="mt-1 shrink-0" /><div><h1 className="text-3xl font-black tracking-tight sm:text-4xl">Сравнение анкет</h1><p className="mt-3 text-sm leading-6 text-white/80">Выбирай предложение, которое подходит тебе</p></div></div>
      <div className="mt-7 h-1 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-white transition-all motion-reduce:transition-none" style={{ width: `${ids.length / 3 * 100}%` }} /></div>
    </section>
    {!uid ? <section className="mt-6 rounded-[28px] border border-blue-100 bg-white px-6 py-12 text-center"><GitCompareArrows size={38} className="mx-auto text-[#0057ff]" /><h2 className="mt-5 text-2xl font-extrabold text-slate-950">Сохрани свой выбор</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">Войди, чтобы добавлять анкеты в сравнение и возвращаться к ним из профиля</p><Link href="/auth" className="btn-primary mt-6">Войти в аккаунт</Link></section>
    : error ? <p role="alert" className="mt-6 rounded-2xl bg-red-50 p-5 text-red-700">{error}. Проверь подключение и открой страницу снова</p>
    : !ready || loading && !entries.length ? <div className="flex items-center justify-center gap-3 py-20 text-slate-500"><Loader2 className="animate-spin text-[#0057ff]" size={24} />Загружаем выбранные анкеты</div>
    : <>
      <div className="mb-4 mt-7 flex items-center justify-between gap-4"><h2 className="text-xl font-extrabold text-slate-950">Твои варианты</h2>{ids.length ? <button type="button" disabled={saving} onClick={() => { if (window.confirm("Убрать все выбранные анкеты из сравнения?")) void update("clear"); }} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-slate-500"><Trash2 size={16} />Очистить</button> : <span className="text-xs text-slate-500">До трёх анкет</span>}</div>
      <div className="grid grid-cols-3 gap-2 sm:gap-4">{[0, 1, 2].map(index => <div key={index} className={`min-w-0 rounded-[20px] border p-3 sm:p-4 ${ids[index] ? "border-[#0057ff] bg-[#eaf2ff]" : "border-dashed border-blue-200 bg-white"}`}>
        {ids[index] ? <><span className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-[#0057ff] text-xs font-bold text-white">{index + 1}</span><p className="mt-3 line-clamp-2 text-xs font-bold leading-5 text-slate-800 sm:text-sm">{entries.find(item => item.id === ids[index])?.listing?.title || "Анкета выбрана"}</p></> : <Link href="/search" className="block text-xs font-semibold leading-5 text-slate-500"><Plus size={20} className="mb-3 text-[#0057ff]" />Добавить анкету</Link>}
      </div>)}</div>
      {saveError ? <p role="alert" className="mt-4 text-sm text-red-600">{saveError}</p> : null}
      {!ids.length ? <section className="mt-6 rounded-[28px] border border-blue-100 bg-white px-6 py-12 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#eaf2ff] text-[#0057ff]"><GitCompareArrows size={30} /></div><h2 className="mt-5 text-2xl font-extrabold text-slate-950">С чего начнём?</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">Открой нужное объявление и нажми «Сравнить анкету». Выбранные предложения появятся здесь</p><Link href="/search" className="btn-primary mt-6 inline-flex items-center gap-3">Найти предложение<ArrowRight size={18} /></Link></section>
      : <>
        <div className="mb-3 mt-7 flex items-center justify-between gap-3"><p className="text-xs leading-5 text-slate-500">Только выбранные объявления · листай таблицу вправо</p><button type="button" onClick={refresh} aria-label="Обновить выбранные анкеты" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#0057ff]"><RefreshCw size={17} className={loading ? "animate-spin" : ""} /></button></div>
        <div role="region" aria-label="Сравнение выбранных анкет" tabIndex={0} className="overflow-x-auto rounded-[24px] border border-blue-100 bg-white">
          <table className="w-full table-fixed border-collapse text-left" style={{ minWidth: 132 + entries.length * 238 }}>
            <colgroup><col style={{ width: 132 }} />{entries.map(entry => <col key={entry.id} style={{ width: 238 }} />)}</colgroup>
            <thead><tr><th scope="col" className="bg-slate-50 p-4 align-top text-sm text-slate-500"><GitCompareArrows size={24} className="mb-3 text-[#0057ff]" />Анкеты</th>{entries.map((entry, index) => <th key={entry.id} scope="col" className="border-l border-blue-100 p-4 align-top font-normal">
              <div className="mb-3 flex items-center justify-between gap-3"><span className="text-[10px] font-extrabold tracking-widest text-[#0057ff]">ВАРИАНТ {index + 1}</span><button type="button" disabled={saving} onClick={() => update("remove", entry.id)} aria-label={`Убрать вариант ${index + 1}`} className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-slate-500"><X size={16} /></button></div>
              {entry.listing ? <><Link href={`/listing/${entry.id}`} className="block"><div className="flex h-36 items-center justify-center overflow-hidden rounded-2xl bg-[#eaf2ff] text-[#0057ff]">{entry.listing.image ? <img src={entry.listing.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <BriefcaseBusiness size={34} />}</div><h3 className="mt-4 line-clamp-3 text-base font-extrabold leading-6 text-slate-950">{entry.listing.title}</h3></Link><p className="mt-2 truncate text-xs text-slate-500">{entry.listing.ownerName}</p>{entry.listing.verified ? <p className="mt-2 flex items-center gap-1 text-xs font-bold text-[#0057ff]"><BadgeCheck size={14} />Проверен</p> : null}<Link href={`/listing/${entry.id}`} className="mt-4 flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#eaf2ff] px-3 text-xs font-bold text-[#0057ff]">Открыть анкету<ArrowRight size={14} /></Link></>
              : <div className="py-6 text-center"><BriefcaseBusiness size={30} className="mx-auto text-slate-400" /><h3 className="mt-4 font-bold text-slate-800">Анкета недоступна</h3><p className="mt-3 text-xs leading-5 text-slate-500">{entry.error}</p><button type="button" onClick={refresh} className="mt-4 min-h-11 text-sm font-bold text-[#0057ff]">Обновить</button></div>}
            </th>)}</tr></thead>
            <tbody>{COMPARISON_ROWS.map(row => <tr key={row.key} className={`border-t border-blue-100 ${row.key === "price" ? "bg-[#eaf2ff]" : ""}`}><th scope="row" className="bg-slate-50 p-4 text-xs font-semibold leading-5 text-slate-500">{row.title}</th>{entries.map(entry => <td key={entry.id} className={`border-l border-blue-100 p-4 text-sm font-semibold leading-6 ${row.key === "price" ? "text-xl font-black text-[#0057ff]" : "text-slate-800"}`}>
              {row.key === "rating" && entry.listing && entry.listing.reviewsCount > 0 ? <><span className="inline-flex items-center gap-2"><Star size={15} fill="#e7a315" color="#e7a315" />{entry.listing.rating}</span><p className="text-xs font-normal text-slate-500">Отзывов: {entry.listing.reviewsCount}</p></> : <span className={row.key === "description" ? "line-clamp-6 whitespace-pre-wrap break-words" : "break-words"}>{entry.listing?.[row.key] || "—"}</span>}
            </td>)}</tr>)}</tbody>
          </table>
        </div>
        {ids.length < 3 ? <Link href="/search" className="mt-5 flex items-center gap-4 rounded-[22px] border border-blue-100 bg-white p-5"><Plus size={24} className="text-[#0057ff]" /><div className="flex-1"><p className="text-sm font-extrabold text-slate-900">Добавить ещё вариант</p><p className="mt-1 text-xs text-slate-500">Выбери анкету в каталоге</p></div><ArrowRight size={19} className="text-[#0057ff]" /></Link> : null}
      </>}
    </>}
  </div></main>;
}
