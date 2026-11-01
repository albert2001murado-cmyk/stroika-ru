"use client";
import { ShieldCheck } from "lucide-react";
import { useMfaChallenge } from "@/lib/useMfaChallenge";
export default function MfaChallenge({ value, onConfirm, onCancel }: { value: ReturnType<typeof useMfaChallenge>; onConfirm: () => void; onCancel?: () => void }) {
  return <section className="mx-auto my-8 w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-7 shadow-sm">
    <ShieldCheck size={36} className="text-blue-600"/><h1 className="mt-5 text-2xl font-black">Подтвердите вход</h1>
    <p className="mt-3 text-sm leading-6 text-slate-500">{value.recovery ? "Введите один из сохранённых резервных кодов. Каждый код можно использовать только один раз" : "Откройте приложение-аутентификатор и введите код для Стровы"}</p>
    <form onSubmit={e => { e.preventDefault(); onConfirm(); }}>
      <label className="mt-5 block text-sm font-bold" htmlFor="mfa-code">{value.recovery ? "Резервный код" : "Код из 6 цифр"}</label>
      <input key={String(value.recovery)} id="mfa-code" inputMode={value.recovery ? "text" : "numeric"} autoComplete="one-time-code" autoFocus value={value.code} onChange={e => value.setCode(e.target.value)} maxLength={value.recovery ? 29 : 6} autoCapitalize="characters" spellCheck={false} className={"mt-2 w-full rounded-2xl border border-slate-200 px-3 py-4 text-center font-mono " + (value.recovery ? "text-sm tracking-wide" : "text-3xl tracking-[.35em]")}/>
      {value.error && <p role="alert" className="mt-3 text-sm text-red-600">{value.error}</p>}
      <button type="submit" disabled={value.busy || !value.valid} className="mt-5 w-full rounded-2xl bg-blue-600 p-4 font-bold text-white transition-colors hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40">{value.busy ? "Проверяем…" : "Подтвердить"}</button>
      {value.recoveryAvailable && <button type="button" disabled={value.busy} onClick={value.toggleRecovery} className="mt-4 w-full text-sm font-bold text-blue-600">{value.recovery ? "Использовать код аутентификатора" : "Использовать резервный код"}</button>}
      <button type="button" disabled={value.busy} onClick={onCancel || value.cancel} className="mt-3 w-full p-2 text-sm font-bold text-slate-500">Назад</button>
    </form>
    <p className="mt-4 text-xs leading-5 text-slate-500">После смены пароля второй фактор остаётся включённым</p>
  </section>;
}
