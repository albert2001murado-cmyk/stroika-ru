"use client";

import { ArrowRight, MapPin, Navigation } from "lucide-react";
import Link from "next/link";

export default function NearbyWorkerButton() {
  return (
    <Link
      href="/nearby"
      aria-label="Открыть карту исполнителей рядом"
      className="group relative inline-flex min-h-14 shrink-0 items-center gap-3 overflow-hidden rounded-2xl bg-[#0057ff] px-4 py-3 text-white shadow-lg shadow-blue-600/20 transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.025] hover:bg-[#004de6] hover:shadow-[0_18px_38px_rgba(0,87,255,0.28)] active:translate-y-0 active:scale-[0.97] sm:px-5"
    >
      <span className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-white/15 blur-2xl transition-transform duration-500 group-hover:scale-150" />
      <span className="pointer-events-none absolute inset-0 -translate-x-[130%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-[130%]" />

      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#0057ff] shadow-md transition-all duration-300 group-hover:rotate-[-6deg] group-hover:scale-110">
        <MapPin size={21} strokeWidth={2.8} />
      </span>

      <span className="relative min-w-0 text-left">
        <span className="block whitespace-nowrap text-sm font-black leading-tight">
          Исполнитель рядом
        </span>
        <span className="mt-0.5 hidden whitespace-nowrap text-[11px] font-bold text-blue-100 sm:block">
          Открыть карту
        </span>
      </span>

      <span className="relative ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15 transition-all duration-300 group-hover:bg-white group-hover:text-[#0057ff]">
        <ArrowRight
          size={17}
          strokeWidth={2.8}
          className="transition-transform duration-300 group-hover:translate-x-1"
        />
      </span>

      <Navigation
        size={14}
        strokeWidth={2.7}
        className="pointer-events-none absolute bottom-1.5 left-1.5 text-white/35 transition-all duration-500 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-white/60"
      />
    </Link>
  );
}
