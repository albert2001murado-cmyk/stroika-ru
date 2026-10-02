"use client";
import { BANK_FIELDS, PAYMENT_OPTIONS, normalizePaymentChoice, type BankDetails, type PaymentChoice } from "@/lib/payments";
import { Banknote, Landmark } from "lucide-react";

export default function PaymentFields({ methods, onMethod, bank, onBank, confirmed, onConfirm, accountType }: {
  methods: unknown; onMethod: (method: PaymentChoice) => void; bank: BankDetails;
  onBank: (bank: BankDetails) => void; confirmed: boolean; onConfirm: (value: boolean) => void; accountType?: string;
}) {
  const choice = normalizePaymentChoice(methods);
  return <div className="mt-5 space-y-4">
    <div role="radiogroup" aria-label="Способ оплаты" className="grid gap-3 sm:grid-cols-2">
      {PAYMENT_OPTIONS.map(option => <button key={option.value} type="button" role="radio" aria-checked={choice === option.value}
        onClick={() => onMethod(option.value)} className={`flex min-h-16 items-center gap-3 rounded-2xl border p-4 text-left text-sm font-bold transition ${choice === option.value ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"}`}>
        {option.value === "bank_account" ? <Landmark size={22} className="shrink-0" /> : <Banknote size={22} className="shrink-0" />}{option.label}
      </button>)}
    </div>
    {choice === "bank_account" ? <fieldset className="rounded-2xl border border-blue-100 bg-slate-50 p-4 sm:p-5">
      <legend className="px-2 font-bold text-slate-900">Реквизиты для оплаты</legend>
      <p className="mb-4 text-sm text-slate-600">Укажите действующий счёт получателя. Реквизиты будут показаны в объявлении.</p>
      <div className="grid gap-4 sm:grid-cols-2">{BANK_FIELDS.filter(field => field.key !== "kpp" || accountType === "ooo").map(field => <label key={field.key} className={field.key === "recipientName" || field.key === "bankName" ? "sm:col-span-2" : ""}>
        <span className="mb-1.5 block text-sm font-semibold text-slate-700">{field.label}{field.key === "inn" && accountType !== "ip" && accountType !== "ooo" ? " (необязательно)" : ""}</span>
        <input value={bank[field.key]} inputMode={field.numeric ? "numeric" : "text"} maxLength={field.maxLength} autoComplete="off"
          onChange={event => { onBank({ ...bank, [field.key]: field.numeric ? event.target.value.replace(/\D/g, "") : event.target.value }); onConfirm(false); }} className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-slate-900 outline-none focus:border-blue-500" />
      </label>)}</div>
      <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-slate-700"><input type="checkbox" checked={confirmed} onChange={event => onConfirm(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600" />Подтверждаю, что реквизиты актуальны и принадлежат указанному получателю</label>
    </fieldset> : null}
  </div>;
}
