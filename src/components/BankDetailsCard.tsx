"use client";

import { Landmark, ShieldCheck } from "lucide-react";
import { normalizeBankDetails, type BankDetails } from "@/lib/payments";

export default function BankDetailsCard({ value }: { value: Partial<BankDetails> | unknown }) {
  const details = normalizeBankDetails(value);
  if (!details.accountNumber) return null;

  return (
    <section className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-[#07368f] via-[#0057ff] to-[#2f7cff] p-5 text-white shadow-[0_24px_65px_rgba(0,87,255,.22)] sm:p-7">
      <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/14 ring-1 ring-white/20">
          <Landmark size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-100">Реквизиты для оплаты</p>
          <h2 className="mt-1 break-words text-xl font-black sm:text-2xl">{details.recipientName}</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Detail label="Расчётный счёт" value={details.accountNumber} />
            <Detail label="Банк" value={details.bankName} />
            <Detail label="БИК" value={details.bik} />
            <Detail label="Корр. счёт" value={details.correspondentAccount} />
            {details.inn ? <Detail label="ИНН" value={details.inn} /> : null}
            {details.kpp ? <Detail label="КПП" value={details.kpp} /> : null}
          </div>
          <p className="mt-5 flex items-center gap-2 text-xs font-bold text-blue-100">
            <ShieldCheck size={15} /> Актуальность реквизитов подтверждена владельцем профиля
          </p>
        </div>
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15">
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-100">{label}</p>
      <p className="mt-1 break-all text-sm font-black">{value || "—"}</p>
    </div>
  );
}
