"use client";

import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import {
  BadgeCheck,
  BarChart3,
  CalendarDays,
  GitCompareArrows,
  BriefcaseBusiness,
  ClipboardList,
  HardHat,
  Headphones,
  Heart,
  LogOut,
  MessageCircle,
  Plus,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import VerifiedBadge from "./VerifiedBadge";

export default function Header() {
  const router = useRouter();
  const [publicationMenuOpen, setPublicationMenuOpen] = useState(false);
  const authContext = useAuth() as any;

  const user = authContext?.user || null;
  const profile = authContext?.profile || null;

  const isVerified = Boolean(
    profile?.verified || profile?.isVerified || profile?.verificationStatus === "approved"
  );

  const displayName =
    profile?.displayName ||
    profile?.name ||
    user?.displayName ||
    user?.email?.split("@")?.[0] ||
    "Профиль";

  const accountLabel =
    profile?.accountType === "ooo"
      ? "ООО"
      : profile?.accountType === "ip"
      ? "ИП"
      : "Физлицо";

  const avatarUrl = profile?.avatarUrl || user?.photoURL || "";

  async function handleLogout() {
    await signOut(auth);
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0057ff] text-white shadow-xl shadow-blue-950/10">
      <div className="flex h-[82px] w-full max-w-none items-center justify-between gap-4 px-3 md:px-4">
        <Link
  href="/"
  className="flex shrink-0 items-center gap-3 min-w-[330px]"
>
  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-[#0057ff] shadow-lg shadow-blue-500/20">
    <HardHat size={30} strokeWidth={2.8} />
  </div>

  <div className="flex min-w-0 flex-col">
    <span className="whitespace-nowrap text-3xl font-black leading-none tracking-tight text-white">
      Стройка.ру
    </span>
    <span className="mt-1 whitespace-nowrap text-sm font-extrabold leading-none text-blue-100">
      все для стройки в одном месте
    </span>
  </div>
</Link>

        <nav className="hidden flex-1 items-center justify-end gap-2 lg:flex">
          <button
            type="button"
            onClick={() => setPublicationMenuOpen(true)}
            className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white px-5 text-sm font-black text-[#0057ff] shadow-lg shadow-blue-950/10 transition duration-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-blue-50 active:scale-[0.97]"
          >
            <Plus size={18} strokeWidth={2.8} />
            Разместить
          </button>

          <Link
            href="/favorites"
            className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white/10 px-5 text-sm font-black text-white ring-1 ring-white/10 transition hover:bg-white/20"
          >
            <Heart size={18} strokeWidth={2.8} />
            Избранное
          </Link>

          <Link
            href="/messages"
            className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white/10 px-5 text-sm font-black text-white ring-1 ring-white/10 transition hover:bg-white/20"
          >
            <MessageCircle size={18} strokeWidth={2.8} />
            Сообщения
          </Link>

          <Link
            href="/portfolio"
            className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white/10 px-4 text-sm font-black text-white ring-1 ring-white/10 transition hover:bg-white/20"
          >
            <BriefcaseBusiness size={18} />
            Портфолио
          </Link>

          <Link
            href="/requests"
            className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white/10 px-4 text-sm font-black text-white ring-1 ring-white/10 transition hover:bg-white/20"
          >
            <ClipboardList size={18} />
            Заявки
          </Link>

          <Link
            href="/verification"
            className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white/10 px-5 text-sm font-black text-white ring-1 ring-white/10 transition hover:bg-white/20"
          >
            <BadgeCheck size={18} strokeWidth={2.8} />
            Проверка
          </Link>

          <Link
            href="/support"
            className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white px-5 text-sm font-black text-[#0057ff] shadow-lg shadow-blue-950/10 transition hover:-translate-y-0.5 hover:bg-blue-50"
          >
            <Headphones size={18} strokeWidth={2.8} />
            Поддержка
          </Link>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {user ? (
            <>
              <Link
                href="/profile"
                className="flex h-14 max-w-[220px] items-center gap-3 rounded-2xl bg-white/10 px-3 text-white ring-1 ring-white/10 transition hover:bg-white/20"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-white/20"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15">
                    <UserRound size={20} />
                  </span>
                )}

                <span className="hidden min-w-0 text-left leading-tight sm:block">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-black">
                      {displayName}
                    </span>
                    {isVerified ? (
                      <ShieldCheck className="shrink-0 text-white" size={16} />
                    ) : null}
                  </span>

                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className="truncate text-xs font-bold text-blue-100">
                      {accountLabel}
                    </span>
                    {isVerified ? <VerifiedBadge size="sm" className="hidden xl:inline-flex" /> : null}
                  </span>
                </span>
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                className="hidden h-12 items-center gap-2 rounded-2xl bg-white/10 px-4 text-sm font-black text-white ring-1 ring-white/10 transition hover:bg-white/20 xl:inline-flex"
              >
                <LogOut size={18} />
                Выйти
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              className="inline-flex h-12 items-center rounded-2xl bg-white px-5 text-sm font-black text-[#0057ff] shadow-lg shadow-blue-950/10 transition hover:-translate-y-0.5 hover:bg-blue-50"
            >
              Войти
            </Link>
          )}
        </div>
      </div>

      <div className="border-t border-white/10 px-4 pb-3 lg:hidden">
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto pt-3">
          <Link
            href="/portfolio"
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white ring-1 ring-white/10"
          >
            <BriefcaseBusiness size={17} />
            Портфолио
          </Link>

          <Link
            href="/availability"
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white ring-1 ring-white/10"
          >
            <CalendarDays size={17} />
            Календарь
          </Link>

          <Link
            href="/analytics"
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white ring-1 ring-white/10"
          >
            <BarChart3 size={17} />
            Статистика
          </Link>

          <Link
            href="/compare"
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white ring-1 ring-white/10"
          >
            <GitCompareArrows size={17} />
            Сравнение
          </Link>

          <Link
            href="/requests"
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white ring-1 ring-white/10"
          >
            <ClipboardList size={17} />
            Заявки
          </Link>

          <button
            type="button"
            onClick={() => setPublicationMenuOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#0057ff] transition active:scale-95"
          >
            <Plus size={17} />
            Разместить
          </button>

          <Link
            href="/favorites"
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white ring-1 ring-white/10"
          >
            <Heart size={17} />
            Избранное
          </Link>

          <Link
            href="/messages"
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white ring-1 ring-white/10"
          >
            <MessageCircle size={17} />
            Сообщения
          </Link>

          <Link
            href="/verification"
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white ring-1 ring-white/10"
          >
            <BadgeCheck size={17} />
            Проверка
          </Link>

          <Link
            href="/support"
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#0057ff]"
          >
            <Headphones size={17} />
            Поддержка
          </Link>

          <Link
            href="/profile"
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white ring-1 ring-white/10"
          >
            <UserRound size={17} />
            Профиль
            {isVerified ? <ShieldCheck size={16} /> : null}
          </Link>
        </div>
      </div>

      {publicationMenuOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 px-4 py-8 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setPublicationMenuOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="publication-menu-title"
            className="w-full max-w-2xl overflow-hidden rounded-[34px] bg-white p-6 text-gray-950 shadow-2xl ring-1 ring-white/40 md:p-8"
          >
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-[#0057ff]">
                  Стройка.ру
                </p>
                <h2 id="publication-menu-title" className="mt-2 text-3xl font-black md:text-4xl">
                  Что разместить?
                </h2>
                <p className="mt-2 font-bold text-gray-500">
                  Выбери нужный тип публикации.
                </p>
              </div>

              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setPublicationMenuOpen(false)}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-700 transition duration-300 hover:rotate-90 hover:bg-gray-200 active:scale-90"
              >
                <X size={24} />
              </button>
            </div>

            <div className="mt-7 grid gap-4 md:grid-cols-2">
              <Link
                href="/post/new"
                onClick={() => setPublicationMenuOpen(false)}
                className="group relative overflow-hidden rounded-[28px] border border-blue-100 bg-blue-50/70 p-5 transition duration-300 hover:-translate-y-1 hover:border-blue-300 hover:bg-blue-50 hover:shadow-xl active:scale-[0.98]"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0057ff] text-white shadow-lg shadow-blue-600/20 transition duration-300 group-hover:rotate-[-5deg] group-hover:scale-110">
                  <HardHat size={28} />
                </span>
                <h3 className="mt-5 text-2xl font-black">Анкету исполнителя</h3>
                <p className="mt-2 leading-6 text-gray-500">
                  Предложить услуги, материалы или спецтехнику.
                </p>
                <span className="mt-5 inline-flex items-center gap-2 font-black text-[#0057ff]">
                  Перейти <Plus className="transition group-hover:rotate-90" size={18} />
                </span>
              </Link>

              <Link
                href="/requests/new"
                onClick={() => setPublicationMenuOpen(false)}
                className="group relative overflow-hidden rounded-[28px] border border-blue-100 bg-white p-5 transition duration-300 hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl active:scale-[0.98]"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg transition duration-300 group-hover:rotate-[5deg] group-hover:scale-110">
                  <ClipboardList size={28} />
                </span>
                <h3 className="mt-5 text-2xl font-black">Заявку заказчика</h3>
                <p className="mt-2 leading-6 text-gray-500">
                  Описать задачу, бюджет, сроки и получить отклики.
                </p>
                <span className="mt-5 inline-flex items-center gap-2 font-black text-[#0057ff]">
                  Перейти <Plus className="transition group-hover:rotate-90" size={18} />
                </span>
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
