"use client";

import { ReceiptText } from "lucide-react";
import { acceptsVatPayment, VAT_PAYMENT_LABEL, type VatPublication } from "@/lib/vat";

export function VatPaymentOption({ checked, onChange, filter = false, disabled = false }: {
  checked: boolean; onChange: (value: boolean) => void; filter?: boolean; disabled?: boolean;
}) {
  return <label className={`my-3 flex min-h-14 md:col-span-2 cursor-pointer items-center gap-3 rounded-2xl border p-4 text-left transition ${checked ? "border-blue-300 bg-blue-50 text-blue-950" : "border-gray-200 bg-white text-gray-900"} ${disabled ? "opacity-60" : "hover:border-blue-300"}`}>
    <ReceiptText size={21} className="shrink-0 text-[#0057ff]" aria-hidden="true" />
    <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold">{VAT_PAYMENT_LABEL}</span>
      <span className="mt-1 block text-xs leading-relaxed text-gray-500">{filter ? "Только объявления с этой возможностью" : "Возможна оплата с НДС"}</span></span>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} className="h-5 w-5 shrink-0 accent-[#0057ff]" aria-label={VAT_PAYMENT_LABEL} />
  </label>;
}

export function VatBadge({ publication }: { publication: unknown }) {
  return acceptsVatPayment(publication) ? <span className="my-1 inline-flex w-fit items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700"><ReceiptText size={13} aria-hidden="true" />{VAT_PAYMENT_LABEL}</span> : null;
}
