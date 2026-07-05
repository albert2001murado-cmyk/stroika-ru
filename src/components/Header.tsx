"use client";

import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import {
  HardHat,
  Headphones,
  Heart,
  LogOut,
  MessageCircle,
  Plus,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

export default function Header() {
  const router = useRouter();
  const authContext = useAuth() as any;

  const user = authContext?.user || null;
  const profile = authContext?.profile || null;

  const displayName =
    profile?.displayName ||
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
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0057ff] text-white shadow-xl shadow-blue-950/10">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#ffde3d] text-[#0057ff] shadow-lg shadow-blue-950/10 md:h-14 md:w-14">
            <HardHat size={30} strokeWidth={2.8} />
          </div>

          <div className="min-w-0 leading-tight">
            <p className="truncate text-2xl font-black tracking-tight text-[#ffde3d] md:text-3xl">
              Стройка.ру
            </p>
            <p className="truncate text-[11px] font-bold text-white/85 md:text-sm">
              строительные услуги рядом
            </p>
          </div>
        </Link>

        <nav className="flex items-center gap-2">
          <Link
            href="/post/new"
            className="hidden items-center gap-2 rounded-2xl bg-[#ffde3d] px-5 py-3 text-sm font-black text-[#0057ff] shadow-lg shadow-blue-950/10 transition hover:-translate-y-0.5 hover:bg-yellow-300 md:inline-flex"
          >
            <Plus size={18} strokeWidth={2.8} />
            Разместить
          </Link>

          <Link
            href="/favorites"
            className="hidden items-center gap-2 rounded-2xl bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/20 lg:inline-flex"
          >
            <Heart size={18} strokeWidth={2.8} />
            Избранное
          </Link>

          <Link
            href="/messages"
            className="hidden items-center gap-2 rounded-2xl bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/20 md:inline-flex"
          >
            <MessageCircle size={18} strokeWidth={2.8} />
            Сообщения
          </Link>

          <Link
            href="/support"
            className="hidden items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-[#0057ff] shadow-lg shadow-blue-950/10 transition hover:-translate-y-0.5 hover:bg-blue-50 md:inline-flex"
          >
            <Headphones size={18} strokeWidth={2.8} />
            Поддержка
          </Link>

          <Link
            href="/support"
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#0057ff] shadow-lg shadow-blue-950/10 md:hidden"
            aria-label="Поддержка"
            title="Поддержка"
          >
            <Headphones size={21} strokeWidth={2.8} />
          </Link>

          {user ? (
            <>
              <Link
                href="/profile"
                className="hidden items-center gap-3 rounded-2xl bg-white/10 px-3 py-2 transition hover:bg-white/20 sm:flex"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="h-10 w-10 rounded-full object-cover ring-2 ring-white/20"
                  />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
                    <UserRound size={20} />
                  </span>
                )}

                <span className="hidden text-left leading-tight xl:block">
                  <span className="block max-w-28 truncate text-sm font-black">
                    {displayName}
                  </span>
                  <span className="block text-xs font-bold text-white/70">
                    {accountLabel}
                  </span>
                </span>
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                className="hidden items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/20 md:inline-flex"
              >
                <LogOut size={18} />
                Выйти
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-[#0057ff] shadow-lg shadow-blue-950/10 transition hover:-translate-y-0.5"
            >
              Войти
            </Link>
          )}
        </nav>
      </div>

      <div className="border-t border-white/10 px-4 pb-3 md:hidden">
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto pt-3">
          <Link
            href="/post/new"
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-[#ffde3d] px-4 py-3 text-sm font-black text-[#0057ff]"
          >
            <Plus size={17} />
            Разместить
          </Link>

          <Link
            href="/favorites"
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white"
          >
            <Heart size={17} />
            Избранное
          </Link>

          <Link
            href="/messages"
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white"
          >
            <MessageCircle size={17} />
            Сообщения
          </Link>

          <Link
            href="/profile"
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white"
          >
            <UserRound size={17} />
            Профиль
          </Link>
        </div>
      </div>
    </header>
  );
}
