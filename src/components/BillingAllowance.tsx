"use client";
import Link from "next/link";
import { Gift, Layers3 } from "lucide-react";
import { useState } from "react";
import { useBilling } from "@/lib/useBilling";
import { accountRequest } from "@/lib/accountClient";
import { CATALOG_TITLES, INTRO_LIMITS, billingCount, type BillingCatalog } from "@/lib/billing";
export default function BillingAllowance({ catalog }: { catalog: BillingCatalog }) {
  const { data, loading, error, refresh } = useBilling(), [busy, setBusy] = useState(false), [issue, setIssue] = useState("");
  const plan = data?.subscriptions[catalog], active = plan && !plan.revoked && plan.endsAt > Date.now();
  const gift = data?.introEligible && !data.introClaimed[catalog] && !active;
  async function activate() { setBusy(true); setIssue(""); try { await accountRequest("/api/billing/intro", { catalog, acceptRules: true }); await refresh(); } catch (e) { setIssue((e as Error).message); } finally { setBusy(false); } }
  return <aside className="my-4 rounded-3xl border border-blue-100 bg-blue-50/60 p-5 text-slate-900">
    <div className="flex items-center gap-2 font-bold text-blue-600"><Layers3 size={20}/>{CATALOG_TITLES[catalog]} · размещение на 30 дней</div>
    {loading ? <p className="mt-2 text-sm text-slate-500">Проверяем доступные размещения…</p> : active ? <p className="mt-2 text-sm">Осталось <strong>{Math.max(0, plan.limit - plan.used)} из {plan.limit}</strong> размещений · до {new Date(plan.endsAt).toLocaleDateString("ru-RU")}</p> : <p className="mt-2 text-sm text-slate-600">Выберите тариф перед публикацией{gift ? " или начните со стартового подарка" : ""}</p>}
    {gift && <><p className="mt-3 text-sm leading-6">Первый подарок: {billingCount(INTRO_LIMITS[catalog], "размещение", "размещения", "размещений")} на 30 дней, один раз для этого каталога. Неиспользованный остаток сгорает</p><button type="button" disabled={busy} onClick={activate} className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50"><Gift size={18}/>{busy ? "Активируем…" : "Принять условия и активировать бесплатно"}</button></>}
    <Link href={`/plans?catalog=${catalog}`} className="mt-3 block text-sm font-bold text-blue-600">Тарифы и условия →</Link>
    {(issue || error) && <p role="alert" className="mt-2 text-sm text-red-600">{issue || error}</p>}
  </aside>;
}
