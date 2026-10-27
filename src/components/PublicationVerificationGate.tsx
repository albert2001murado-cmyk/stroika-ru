"use client";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
export default function PublicationVerificationGate() {
  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-12">
      <section className="mx-auto max-w-lg rounded-3xl border border-blue-100 bg-white p-7">
        <ShieldCheck size={32} className="text-blue-600" />
        <h1 className="mt-4 text-2xl font-bold text-slate-950">
          Сначала пройдите проверку
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Для размещения анкеты исполнителя или заявки заказчика нужен
          проверенный аккаунт. Заявка на проверку общая для сайта и приложения.
        </p>
        <Link href="/verification" className="btn-primary mt-6 inline-flex">
          Пройти проверку
        </Link>
        <Link
          href="/profile"
          className="ml-4 inline-flex text-sm font-bold text-slate-500"
        >
          В профиль
        </Link>
      </section>
    </main>
  );
}
