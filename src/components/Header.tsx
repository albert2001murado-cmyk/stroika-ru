"use client";

import { useAuth } from "@/components/AuthProvider";
import {
  BriefcaseBusiness,
  Heart,
  LogOut,
  MessageCircle,
  Plus,
  UserRound,
} from "lucide-react";
import Link from "next/link";

function Header() {
  const { user, profile, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 bg-[#0057ff] shadow-lg shadow-blue-900/10">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
        <Link href="/" className="flex items-center gap-3 text-white">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ffd233] text-[#003b95]">
            <BriefcaseBusiness size={24} />
          </div>

          <div>
            <p className="text-3xl font-black leading-none text-[#ffd233]">
              Стройка.ру
            </p>

            <p className="text-xs font-bold text-blue-100">
              строительные услуги рядом
            </p>
          </div>
        </Link>

        <nav className="flex items-center gap-3">
          <Link
            href="/post/new"
            className="hidden items-center gap-2 rounded-2xl bg-[#ffd233] px-5 py-3 font-black text-[#003b95] transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-yellow-300/30 sm:flex"
          >
            <Plus size={18} />
            Разместить
          </Link>

          {user && (
            <>
              <Link
                href="/favorites"
                className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 font-black text-white transition hover:bg-white/20"
              >
                <Heart size={19} className="fill-red-500 text-red-500" />
                <span className="hidden md:inline">Избранное</span>
              </Link>

              <Link
                href="/messages"
                className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 font-black text-white transition hover:bg-white/20"
              >
                <MessageCircle size={19} />
                <span className="hidden md:inline">Сообщения</span>
              </Link>
            </>
          )}

          {user ? (
            <>
              <Link
                href="/profile"
                className="flex items-center gap-3 rounded-2xl bg-white/10 px-3 py-2 font-black text-white transition hover:bg-white/20"
              >
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white/15">
                  {profile?.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.displayName || "Профиль"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <UserRound size={20} />
                  )}
                </div>

                <span className="hidden lg:block">
                  {profile?.displayName || user.displayName || "Профиль"}
                </span>
              </Link>

              <button
                type="button"
                onClick={logout}
                className="hidden items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 font-black text-white transition hover:bg-white/20 md:flex"
              >
                <LogOut size={18} />
                Выйти
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              className="rounded-2xl bg-white px-5 py-3 font-black text-[#0057ff] transition hover:-translate-y-0.5 hover:shadow-xl"
            >
              Войти
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

export { Header };
export default Header;
