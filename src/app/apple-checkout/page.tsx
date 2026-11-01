"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { accountRequest } from "@/lib/accountClient";
export default function AppleCheckoutPage() {
  const { user, loading, logout } = useAuth(), [token, setToken] = useState(""), [initialized, setInitialized] = useState(false), [confirmedUid, setConfirmedUid] = useState(""), [linkedUid, setLinkedUid] = useState(""), [retry, setRetry] = useState(0), [error, setError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search), incoming = params.get("externalPurchaseToken");
    if (incoming && incoming.length <= 8192) { sessionStorage.setItem("strova-apple-external-token", incoming); window.history.replaceState(null,"","/apple-checkout"); }
    const saved = sessionStorage.getItem("strova-apple-external-token") || "";
    setToken(saved); setInitialized(true);
  }, []);
  useEffect(() => {
    if (!user || !token || confirmedUid !== user.uid || linkedUid === user.uid) return;
    let alive = true;
    setError("");
    void accountRequest<{ id: string }>("/api/billing/apple/external-token", { token }).then(result => { if (!alive) return; sessionStorage.removeItem("strova-apple-external-token"); sessionStorage.setItem(`strova-apple-checkout:${user.uid}`, result.id); setLinkedUid(user.uid); }).catch(e => { if (alive) setError((e as Error).message); });
    return () => { alive = false; };
  }, [user?.uid, token, confirmedUid, linkedUid, retry]);
  async function switchAccount() {
    setConfirmedUid(""); setError("");
    try { await logout(); window.location.assign("/auth?next=/apple-checkout"); }
    catch (e) { setError((e as Error).message || "Не удалось выйти из аккаунта"); }
  }
  const accountConfirmed = !!user && confirmedUid === user.uid, ready = !!user && (!token || linkedUid === user.uid);
  return <main className="app-page mx-auto max-w-xl px-5 pb-28 pt-10"><section className="rounded-[30px] bg-blue-600 p-8 text-white"><p className="font-bold uppercase tracking-widest">Строва</p><h1 className="mt-5 text-3xl font-black">Тарифы для вашего дела</h1><p className="mt-4 leading-7 text-blue-100">Оплата через ЮKassa на сайте. Выберите каталог и тариф — он появится и в приложении после подтверждения оплаты</p></section><section className="mt-6 rounded-3xl border border-slate-200 bg-white p-7">{loading || !initialized ? <p>Проверяем аккаунт…</p> : !user ? <><p className="leading-7 text-slate-600">Войдите в тот же аккаунт, что используется в приложении Строва</p><Link href="/auth?next=/apple-checkout" className="mt-5 block rounded-2xl bg-blue-600 p-4 text-center font-bold text-white">Войти на сайте</Link></> : !accountConfirmed ? <><h2 className="text-xl font-bold text-slate-900">Проверьте аккаунт</h2><p className="mt-3 leading-7 text-slate-600">Тариф будет подключён к этому аккаунту. Убедитесь, что он же открыт в приложении</p><p className="mt-4 break-words rounded-2xl bg-slate-50 p-4 font-semibold text-slate-900">{user.email || user.phoneNumber || "Аккаунт Стровы"}</p><button type="button" onClick={() => { setError(""); setConfirmedUid(user.uid); }} className="mt-5 w-full rounded-2xl bg-blue-600 p-4 font-bold text-white">Продолжить с этим аккаунтом</button><button type="button" onClick={() => void switchAccount()} className="mt-3 w-full rounded-2xl p-3 font-semibold text-blue-600">Войти в другой аккаунт</button>{error && <p role="alert" className="mt-3 text-red-600">{error}</p>}</> : error ? <><p role="alert" className="text-red-600">{error}</p><button type="button" onClick={() => { setError(""); setRetry(value => value + 1); }} className="mt-4 font-bold text-blue-600">Повторить</button></> : <><p className="leading-7 text-slate-600">{ready ? "Аккаунт подтверждён — можно выбрать тариф" : "Связываем переход из приложения с вашим аккаунтом…"}</p>{ready && <Link href="/plans" className="mt-5 block rounded-2xl bg-blue-600 p-4 text-center font-bold text-white">Выбрать тариф</Link>}</>}<p className="mt-5 text-sm leading-6 text-slate-500">Платёж обрабатывает ЮKassa. Поддержка по оплате и возвратам — в профиле Стровы</p></section></main>;
}
