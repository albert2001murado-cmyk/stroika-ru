"use client";

import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import {
  BadgeCheck,
  HardHat,
  Headphones,
  Heart,
  LogOut,
  MessageCircle,
  Plus,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import VerifiedBadge from "./VerifiedBadge";

export default function Header() {
  const router = useRouter();
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
      <div className="mx-auto flex h-[82px] max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
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
      строительные услуги рядом
    </span>
  </div>
</Link>

        <nav className="hidden flex-1 items-center justify-end gap-2 lg:flex">
          <Link
            href="/post/new"
            className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white px-5 text-sm font-black text-[#0057ff] shadow-lg shadow-blue-950/10 transition hover:-translate-y-0.5 hover:bg-blue-50"
          >
            <Plus size={18} strokeWidth={2.8} />
            Разместить
          </Link>

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
            href="/post/new"
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#0057ff]"
          >
            <Plus size={17} />
            Разместить
          </Link>

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
    </header>
  );
}
