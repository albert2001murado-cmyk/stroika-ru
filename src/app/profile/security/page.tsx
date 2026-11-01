"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import { useAccountSecurity } from "@/lib/useAccountSecurity";
import { totpQr } from "@/lib/totpQr";
export default function AccountSecurityPage() {
  const v = useAccountSecurity(), qr = useMemo(() => v.uri ? totpQr(v.uri) : null, [v.uri]);
  const [saved, setSaved] = useState(false), [recovery, setRecovery] = useState(false);
  const valid = recovery ? /^[A-F0-9]{24}$/.test(v.code.replace(/-/g, "")) : /^\d{6}$/.test(v.code);
  const primary = "w-full rounded-2xl bg-[#0057ff] p-4 font-bold text-white transition-colors hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40";
  const input = "w-full rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 outline-none transition-shadow focus:border-blue-500 focus:ring-4 focus:ring-blue-50";
  return <main className="app-page mx-auto max-w-3xl px-4 pb-32 pt-6 sm:px-8">
    <Link href="/profile" className="inline-flex items-center gap-2 font-bold text-blue-600"><ArrowLeft size={18}/>В профиль</Link>
    <header className="mt-6 rounded-[32px] bg-[#0057ff] p-8 text-white"><ShieldCheck size={36}/><h1 className="mt-5 text-4xl font-black tracking-tight">Безопасность</h1><p className="mt-4 max-w-xl leading-7 text-blue-100">Пароль и код с вашего телефона — два шага для входа</p></header>
    {!v.uid ? <Link href="/auth?next=/profile/security" className="mt-8 block font-bold text-blue-600">Войти в аккаунт →</Link> : <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-6 sm:p-8">
      <div className="flex items-center gap-3"><span className="rounded-2xl bg-blue-50 p-3 text-blue-600"><Smartphone size={24}/></span><div><h2 className="text-xl font-black">Двухэтапный вход</h2><p className="mt-1 text-sm font-semibold text-slate-500">{v.ready ? v.enabled ? "Включён" : "Пока не включён" : v.error ? "Не удалось проверить состояние" : "Проверяем состояние…"}</p></div></div>
      <p className="mt-5 text-sm leading-7 text-slate-600">Подойдёт Google Authenticator, Microsoft Authenticator или другое приложение с одноразовыми кодами. Коды работают без SMS и мобильной связи</p>
      {!v.ready ? <button disabled={v.busy} onClick={() => void v.retry()} className="mt-5 font-bold text-blue-600">Повторить проверку</button> : !v.email ? <p className="mt-5 text-sm leading-6 text-slate-600">Для подключения нужен аккаунт с почтой и паролем</p> : !v.verified ? <div className="mt-5 rounded-2xl bg-slate-50 p-5"><p className="break-words text-sm leading-6">Сначала подтвердите почту {v.email}</p><div className="mt-4 flex flex-wrap gap-3"><button disabled={v.busy} onClick={() => void v.sendVerification()} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">Отправить письмо</button><button disabled={v.busy} onClick={() => void v.checkVerification()} className="px-3 py-3 font-bold text-blue-600">Проверить почту</button></div></div> : v.recoveryCodes.length ? <div className="mt-6 space-y-5">
        <h3 className="text-lg font-extrabold">Сохраните резервные коды</h3><p className="text-sm leading-6 text-slate-600">Они помогут войти, если телефон потеряется. Каждый код работает один раз. После закрытия этого окна коды больше не показываются</p>
        <div className="grid gap-2 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">{v.recoveryCodes.map(code => <code key={code} className="select-all whitespace-nowrap py-1 text-center text-xs font-bold text-slate-800">{code}</code>)}</div>
        <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} className="mt-1 h-5 w-5 accent-blue-600"/>Я сохранил коды в надёжном месте отдельно от телефона</label>
        <button disabled={!saved} onClick={() => { v.dismissCodes(); setSaved(false); }} className={primary}>Готово</button>
      </div> : v.secret ? <div className="mt-6 space-y-5">
        <h3 className="font-extrabold">1 · Добавьте Строву в аутентификатор</h3>
        {qr && <svg role="img" aria-label="QR-код для подключения аутентификатора" viewBox={"0 0 " + qr.size + " " + qr.size} className="mx-auto h-56 w-56 rounded-xl bg-white" shapeRendering="crispEdges"><path d={qr.path} fill="#0f172a"/></svg>}
        <p className="text-sm leading-6 text-slate-500">Отсканируйте QR-код с другого устройства или добавьте ключ вручную на этом телефоне</p>
        <code className="block select-all break-all rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold tracking-widest" aria-label="Секретный ключ">{v.secret}</code>
        <h3 className="font-extrabold">2 · Введите первый код</h3><label htmlFor="security-code" className="sr-only">Код аутентификатора</label><input id="security-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={v.code} onChange={e => v.setCode(e.target.value)} className={input + " text-center text-2xl tracking-[.3em]"}/>
        <button disabled={v.busy || !/^\d{6}$/.test(v.code)} onClick={() => void v.finish()} className={primary}>{v.busy ? "Включаем защиту…" : "Включить защиту"}</button><button disabled={v.busy} onClick={v.cancel} className="w-full p-2 font-bold text-slate-500">Отменить подключение</button>
      </div> : <div className="mt-6 space-y-4">
        {v.enabled && <p className="text-sm leading-6 text-slate-600">Осталось резервных кодов: {v.remaining}. Для изменения защиты подтвердите пароль и код</p>}
        <label className="flex items-center gap-2 text-sm font-bold" htmlFor="security-password"><KeyRound size={16}/>Текущий пароль</label><input id="security-password" type="password" value={v.password} autoComplete="current-password" onChange={e => v.setPassword(e.target.value)} className={input}/>
        {v.enabled ? <><label htmlFor="security-confirm-code" className="block text-sm font-bold">{recovery ? "Резервный код" : "Код аутентификатора"}</label><input id="security-confirm-code" value={v.code} onChange={e => v.setCode(e.target.value)} inputMode={recovery ? "text" : "numeric"} maxLength={recovery ? 29 : 6} autoComplete="one-time-code" className={input + " text-center font-mono"}/><button disabled={v.busy} onClick={() => { setRecovery(x => !x); v.setCode(""); }} className="text-sm font-bold text-blue-600">{recovery ? "Код аутентификатора" : "Использовать резервный код"}</button><button disabled={v.busy || !v.password || !valid} onClick={() => { setSaved(false); void v.regenerate(); }} className={primary}>Создать новые резервные коды</button><button disabled={v.busy || !v.password || !valid} onClick={() => void v.disable()} className="w-full rounded-2xl border border-slate-200 p-4 font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40">Отключить двухэтапный вход</button></> : <button disabled={v.busy || !v.password} onClick={() => void v.begin()} className={primary}>{v.busy ? "Подключаем…" : "Подключить аутентификатор"}</button>}
      </div>}
      {v.error && <p role="alert" className="mt-5 text-sm font-semibold text-red-600">{v.error}</p>}{v.message && <p role="status" className="mt-5 text-sm leading-6 text-slate-600">{v.message}</p>}
    </section>}
    <p className="mt-6 px-2 text-sm leading-7 text-slate-500">Не передавайте никому пароль, ключ и одноразовые коды. Потеряны и телефон, и резервные коды — обратитесь в поддержку. Сброс пароля по почте не отключает защиту</p>
  </main>;
}
