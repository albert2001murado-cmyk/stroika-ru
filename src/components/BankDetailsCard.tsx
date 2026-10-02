import { BANK_FIELDS, normalizeBankDetails } from "@/lib/payments";
import { Landmark } from "lucide-react";
export default function BankDetailsCard({ value }: { value: unknown }) {
  const bank = normalizeBankDetails(value);
  if (!bank.accountNumber) return null;
  return <section className="my-5 rounded-2xl border border-blue-100 bg-blue-50/50 p-4 sm:p-5">
    <h3 className="flex items-center gap-2 font-bold text-slate-900"><Landmark size={20} className="text-blue-600" />Реквизиты для оплаты</h3>
    <p className="mt-2 text-xs text-slate-500">Указаны исполнителем. Перед оплатой согласуйте условия и реквизиты.</p>
    <dl className="mt-4 space-y-3">{BANK_FIELDS.filter(field => bank[field.key]).map(field => <div key={field.key}>
      <dt className="text-xs font-semibold text-slate-500">{field.label}</dt><dd className="mt-1 select-text break-all text-sm font-bold text-slate-900">{bank[field.key]}</dd>
    </div>)}</dl>
  </section>;
}
