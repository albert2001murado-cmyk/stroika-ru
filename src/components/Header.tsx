"use client";

import Link from "next/link";
import {
  HardHat,
  LogOut,
  MessageCircle,
  Plus,
  UserRound,
} from "lucide-react";
import { useAuth } from "./AuthProvider";

export function Header() {
  const { user, profile, logout } = useAuth();
  const avatarUrl = profile?.avatarUrl || user?.photoURL || "";
  const userName = profile?.displayName || user?.displayName || user?.email;

  return (
    <header className="sticky top-0 z-50 bg-[#0057ff] text-white shadow-lg shadow-blue-900/15">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ffd233] text-[#003b95] shadow-md">
            <HardHat size={25} />
          </div>

          <div>
            <div className="text-3xl font-black tracking-tight text-[#ffd233]">
              Стройка.ру
            </div>
            <div className="-mt-1 hidden text-xs font-bold text-blue-100 sm:block">
              строительные услуги рядом
            </div>
          </div>
        </Link>

        <nav className="flex items-center gap-3">
          <Link
            href="/post/new"
            className="flex items-center gap-2 rounded-2xl bg-[#ffd233] px-4 py-3 text-sm font-black text-[#003b95] transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-yellow-300/30"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Разместить</span>
          </Link>

          {user ? (
            <>
              <Link
                href="/messages"
                className="flex items-center gap-2 rounded-2xl border border-white/25 px-4 py-3 text-sm font-bold transition hover:bg-white/15"
              >
                <MessageCircle size={18} />
                <span className="hidden sm:inline">Сообщения</span>
              </Link>

              <Link
                href="/profile"
                className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-3 py-2 transition hover:bg-white/15"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-[#0057ff] ring-2 ring-white/35">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Фото профиля"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <UserRound size={22} />
                  )}
                </div>

                <div className="hidden text-left sm:block">
                  <p className="max-w-[150px] truncate text-sm font-black">
                    {userName}
                  </p>
                  <p className="text-xs text-blue-100">
                    {profile?.accountType === "ip"
                      ? "ИП"
                      : profile?.accountType === "ooo"
                      ? "ООО"
                      : "Физлицо"}
                  </p>
                </div>
              </Link>

              <button
                onClick={logout}
                className="flex items-center gap-2 rounded-2xl border border-white/25 px-4 py-3 text-sm font-bold transition hover:bg-white/15"
              >
                <LogOut size={17} />
                <span className="hidden sm:inline">Выйти</span>
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#0057ff] transition hover:-translate-y-0.5 hover:shadow-xl"
            >
              <UserRound size={18} />
              Войти
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
