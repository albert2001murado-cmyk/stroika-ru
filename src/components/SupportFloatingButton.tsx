"use client";

import { Headphones } from "lucide-react";
import Link from "next/link";

export default function SupportFloatingButton() {
  return (
    <Link
      href="/support"
      className="fixed bottom-5 right-5 z-50 hidden items-center gap-2 rounded-full bg-[#0057ff] px-5 py-4 text-sm font-black text-white shadow-2xl shadow-blue-500/30 transition hover:-translate-y-0.5 md:flex"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ffde3d] text-[#0057ff]">
        <Headphones size={20} strokeWidth={2.8} />
      </span>
      Поддержка
    </Link>
  );
}
