"use client";

import { useAuth } from "@/components/AuthProvider";
import { needsRussianPhoneUpdate } from "@/lib/phone";
import { Phone, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function PhoneMigrationPrompt() {
  const { user, profile, loading } = useAuth();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!loading && user && needsRussianPhoneUpdate(profile?.phone || "")) setOpen(true);
  }, [loading, profile?.phone, user]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-[30px] bg-white p-6 shadow-2xl">
        <button onClick={() => setOpen(false)} className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><X size={20} /></button>
        <span className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-blue-50 text-[#0057ff]"><Phone size={27} /></span>
        <h2 className="mt-5 text-2xl font-black text-slate-950">Обновите номер на +7</h2>
        <p className="mt-2 font-semibold leading-7 text-slate-500">Поменяйте начало номера с 8 на +7 — это актуальный код страны. Без корректного номера новые публикации создать не получится.</p>
        <Link href="/profile" onClick={() => setOpen(false)} className="mt-6 flex min-h-13 items-center justify-center rounded-2xl bg-[#0057ff] px-5 py-4 font-black text-white shadow-lg shadow-blue-200">Обновить в профиле</Link>
      </div>
    </div>
  );
}
