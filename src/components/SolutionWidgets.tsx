"use client";

import { ArrowUpRight } from "lucide-react";

export type SolutionSelection = {
  category: string;
  subcategory?: string;
};

type Props = {
  onSelect: (selection: SolutionSelection) => void;
};

const SOLUTIONS = [
  {
    id: "build-house",
    eyebrow: "Строительство",
    title: "Построить дом мечты",
    description: "Проект, фундамент, коробка, кровля и отделка — найдём подходящую бригаду.",
    cta: "Найти строителей",
    image: "/solutions/build-house.png",
    category: "🧱 Строительство",
    subcategory: "Строительство домов под ключ",
    surface: "from-[#eaf2ff] via-white to-[#fff0f4]",
  },
  {
    id: "renovation",
    eyebrow: "Ремонт",
    title: "Сделать ремонт",
    description: "Квартира, комната, кухня или ванная — от черновых работ до готового интерьера.",
    cta: "Найти бригаду",
    image: "/solutions/renovation.png",
    category: "🏠 Ремонт квартир",
    subcategory: "Ремонт квартир",
    surface: "from-[#f0f5ff] via-white to-[#fff1f7]",
  },
  {
    id: "site-improvement",
    eyebrow: "Участок",
    title: "Благоустроить участок",
    description: "Септик, ливнёвка, дренаж, ограждение, дорожки и автополив.",
    cta: "Найти специалистов",
    image: "/solutions/site-improvement.png",
    category: "🌳 Участок и благоустройство",
    subcategory: "",
    surface: "from-[#ebfbf7] via-white to-[#edf4ff]",
  },
  {
    id: "utilities",
    eyebrow: "Инженерные системы",
    title: "Провести коммуникации",
    description: "Вода, отопление, канализация, электрика и вентиляция для дома или объекта.",
    cta: "Подобрать мастеров",
    image: "/solutions/utilities.png",
    category: "❄️ Инженерные системы",
    subcategory: "",
    surface: "from-[#e9f2ff] via-white to-[#eff7ff]",
  },
] as const;

export default function SolutionWidgets({ onSelect }: Props) {
  return (
    <section aria-labelledby="solution-widgets-title">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0057ff]">
            Готовые решения
          </p>
          <h2 id="solution-widgets-title" className="mt-1 text-3xl font-black tracking-[-0.04em] text-slate-950 sm:text-4xl">
            Решим задачу целиком
          </h2>
        </div>
        <p className="max-w-xl text-sm font-bold leading-6 text-slate-500 sm:text-right">
          Выберите сценарий — сразу покажем подходящие анкеты исполнителей.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {SOLUTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect({ category: item.category, subcategory: item.subcategory })}
            className={`group relative min-h-[286px] overflow-hidden rounded-[28px] border border-blue-100 bg-gradient-to-br ${item.surface} p-5 text-left shadow-[0_16px_45px_rgba(15,23,42,0.07)] transition duration-500 ease-out hover:-translate-y-1.5 hover:border-blue-200 hover:shadow-[0_24px_60px_rgba(0,87,255,0.14)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 active:scale-[0.985]`}
            aria-label={`${item.title}. ${item.cta}`}
          >
            <span className="relative z-10 block max-w-[68%] pb-16">
              <span className="inline-flex rounded-full bg-white/85 px-3 py-1 text-[10px] font-black uppercase tracking-[0.11em] text-[#0057ff] shadow-sm ring-1 ring-blue-100/80">
                {item.eyebrow}
              </span>
              <span className="mt-4 block text-[21px] font-black leading-[1.08] tracking-[-0.035em] text-slate-950">
                {item.title}
              </span>
              <span className="mt-2.5 block text-[12px] font-bold leading-[18px] text-slate-500">
                {item.description}
              </span>
            </span>

            <img
              src={item.image}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-3 -right-6 h-[132px] w-[132px] object-contain drop-shadow-[0_16px_18px_rgba(15,23,42,0.16)] transition duration-500 ease-out group-hover:-translate-x-1 group-hover:-translate-y-2 group-hover:scale-[1.06]"
            />

            <span className="absolute bottom-5 left-5 z-20 inline-flex items-center gap-2 whitespace-nowrap text-xs font-black text-[#0057ff]">
              {item.cta}
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0057ff] text-white shadow-lg shadow-blue-600/20 transition duration-300 group-hover:translate-x-1 group-hover:-translate-y-0.5">
                <ArrowUpRight size={16} strokeWidth={2.8} />
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
