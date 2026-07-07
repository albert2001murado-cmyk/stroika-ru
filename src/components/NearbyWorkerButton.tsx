"use client";

import {
  ArrowRight,
  BadgeCheck,
  Building2,
  LocateFixed,
  MapPin,
  Navigation,
  Radar,
  Sparkles,
  Truck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

export default function NearbyWorkerButton() {
  return (
    <section className="w-full px-4 pb-10 pt-4 md:px-6 md:pb-12">
  <div className="mx-auto w-full max-w-7xl">
        <Link
          href="/nearby"
          className="group relative block w-full overflow-hidden rounded-[34px] bg-[#0057ff] p-6 text-white shadow-2xl shadow-blue-500/20 transition hover:-translate-y-1 hover:shadow-blue-500/30 md:p-8"
        >
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/15 blur-3xl" />
          <div className="absolute -bottom-24 left-1/3 h-60 w-60 rounded-full bg-blue-200/20 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-white text-[#0057ff] shadow-lg shadow-blue-950/10">
                <MapPin size={34} strokeWidth={2.8} />
              </div>

              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-xs font-black text-blue-50 ring-1 ring-white/15">
                  <Sparkles size={15} />
                  Реальная карта
                </div>

                <h2 className="mt-3 text-3xl font-black leading-tight md:text-4xl">
                  Исполнитель рядом
                </h2>

                <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-blue-50 md:text-base">
                  Открой карту как в Яндекс.Картах, выбери категорию и найди
                  мастеров, компании, спецтехнику или материалы рядом.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:w-[520px]">
              <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/10">
                <UsersRound size={24} />
                <p className="mt-2 text-sm font-black">Профили</p>
                <p className="text-xs font-semibold text-blue-50">на карте</p>
              </div>

              <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/10">
                <Radar size={24} />
                <p className="mt-2 text-sm font-black">Фильтры</p>
                <p className="text-xs font-semibold text-blue-50">
                  по категории
                </p>
              </div>

              <div className="inline-flex items-center justify-center gap-3 rounded-3xl bg-white px-5 py-4 text-sm font-black text-[#0057ff] shadow-xl shadow-blue-950/10 transition group-hover:bg-blue-50">
                <Navigation size={20} strokeWidth={2.8} />
                Открыть
              </div>
            </div>
          </div>
        </Link>
      </div>
    </section>
  );
}
