"use client";

import {
  CONTACT_PREFERENCE_OPTIONS,
  type ContactPreference,
} from "@/lib/contactPreference";
import { Check, MessageCircle, Phone } from "lucide-react";

type Props = {
  value: ContactPreference;
  onChange: (value: ContactPreference) => void;
};

export default function ContactPreferencePicker({ value, onChange }: Props) {
  return (
    <section className="md:col-span-2 rounded-[22px] border border-blue-100 bg-gradient-to-br from-blue-50/80 to-white p-4 sm:p-5">
      <div>
        <p className="text-sm font-black text-slate-950">Как исполнителям связаться с вами?</p>
        <p className="mt-1 text-sm font-semibold leading-5 text-slate-500">
          Выберите один удобный вариант для этой заявки.
        </p>
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
        {CONTACT_PREFERENCE_OPTIONS.map((option) => {
          const active = value === option.value;
          const Icon = option.value === "calls" ? Phone : MessageCircle;

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={`group relative flex min-h-[118px] flex-col items-start rounded-2xl border p-4 text-left transition duration-200 active:scale-[0.98] ${
                active
                  ? "border-[#0057ff] bg-[#0057ff] text-white shadow-lg shadow-blue-600/20"
                  : "border-slate-200 bg-white text-slate-950 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
              }`}
            >
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? "bg-white/16" : "bg-blue-50 text-[#0057ff]"}`}>
                <Icon size={20} strokeWidth={2.7} />
                {option.value === "both" ? <Phone className="-ml-1" size={15} strokeWidth={2.7} /> : null}
              </span>
              <span className="mt-3 text-sm font-black">{option.title}</span>
              <span className={`mt-1 text-xs font-semibold leading-4 ${active ? "text-blue-100" : "text-slate-500"}`}>
                {option.description}
              </span>
              <span className={`absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full border ${active ? "border-white/40 bg-white text-[#0057ff]" : "border-slate-200 bg-white"}`}>
                {active ? <Check size={14} strokeWidth={3.2} /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
