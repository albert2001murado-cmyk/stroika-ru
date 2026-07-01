"use client";

import { Heart } from "lucide-react";
import Link from "next/link";

type FavoritesShortcutProps = {
  variant?: "blue" | "white" | "card";
  className?: string;
};

export default function FavoritesShortcut({
  variant = "blue",
  className = "",
}: FavoritesShortcutProps) {
  if (variant === "white") {
    return (
      <Link
        href="/favorites"
        className={`inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-[#0057ff] shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl ${className}`}
      >
        <Heart size={20} className="fill-red-500 text-red-500" />
        Избранные анкеты
      </Link>
    );
  }

  if (variant === "card") {
    return (
      <Link
        href="/favorites"
        className={`group flex items-center justify-between gap-4 rounded-[26px] border border-red-100 bg-red-50 p-5 transition hover:-translate-y-0.5 hover:bg-red-100 hover:shadow-lg ${className}`}
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-red-500 shadow-sm">
            <Heart size={23} className="fill-red-500" />
          </div>

          <div>
            <p className="text-lg font-black text-gray-950">
              Избранные анкеты
            </p>

            <p className="text-sm font-bold text-gray-500">
              Все сохранённые услуги и исполнители
            </p>
          </div>
        </div>

        <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-red-500">
          Открыть
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/favorites"
      className={`inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0057ff] px-5 py-3 font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-600/25 ${className}`}
    >
      <Heart size={20} className="fill-red-500 text-red-500" />
      Избранные анкеты
    </Link>
  );
}
