"use client";

import {
  ArrowRight,
  BadgeCheck,
  Bath,
  Blocks,
  Bolt,
  Building2,
  CheckCircle2,
  DoorOpen,
  Drill,
  Hammer,
  HardHat,
  Home,
  Layers3,
  Paintbrush,
  PlugZap,
  Ruler,
  ShieldCheck,
  ShowerHead,
  Sofa,
  Sparkles,
  Truck,
  Wrench,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";

type CategoryLike = {
  id?: string;
  title?: string;
  name?: string;
  icon?: ReactNode;
  emoji?: string;
  subcategories?: string[];
  count?: number;
};

type PremiumCategoryGridProps = {
  categories: CategoryLike[];
  selectedCategory?: string;
  onSelectCategory?: (category: string) => void;
  className?: string;
};

const iconByName: Array<{
  keys: string[];
  Icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
}> = [
  { keys: ["ремонт"], Icon: Home },
  { keys: ["отдел"], Icon: Paintbrush },
  { keys: ["элект"], Icon: Bolt },
  { keys: ["сант"], Icon: ShowerHead },
  { keys: ["стро"], Icon: HardHat },
  { keys: ["спец", "техника", "экскават", "кран"], Icon: Truck },
  { keys: ["материал"], Icon: Blocks },
  { keys: ["пол"], Icon: Layers3 },
  { keys: ["крыша", "фасад"], Icon: Building2 },
  { keys: ["участок", "благоустрой"], Icon: Ruler },
  { keys: ["инженер"], Icon: PlugZap },
  { keys: ["окна", "двер"], Icon: DoorOpen },
  { keys: ["мебель"], Icon: Sofa },
  { keys: ["дополнитель"], Icon: Sparkles },
  { keys: ["проект"], Icon: Ruler },
];

function getTitle(category: CategoryLike) {
  return category.title || category.name || "Категория";
}

function getSubCount(category: CategoryLike) {
  if (typeof category.count === "number") return category.count;
  return category.subcategories?.length || 0;
}

function getIcon(title: string) {
  const normalized = title.toLowerCase();

  return (
    iconByName.find((item) =>
      item.keys.some((key) => normalized.includes(key))
    )?.Icon || Hammer
  );
}

function getPreviewSubcategories(category: CategoryLike) {
  return (category.subcategories || []).slice(0, 3);
}

export default function PremiumCategoryGrid({
  categories,
  selectedCategory,
  onSelectCategory,
  className = "",
}: PremiumCategoryGridProps) {
  return (
    <section className={`relative ${className}`}>
      <div className="pointer-events-none absolute inset-x-0 -top-10 h-40 rounded-[48px] bg-[radial-gradient(circle_at_20%_20%,rgba(0,87,255,0.13),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(56,189,248,0.13),transparent_35%)] blur-2xl" />

      <div className="relative mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#0057ff] shadow-sm shadow-blue-500/10 backdrop-blur">
            <ShieldCheck size={15} strokeWidth={2.6} />
            Проверенные направления
          </div>

          <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Категории услуг
          </h2>

          <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-slate-500 sm:text-base">
            Выберите направление: ремонт, стройка, материалы, спецтехника и другие услуги рядом.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onSelectCategory?.("")}
          className="group inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#0057ff] px-5 text-sm font-black text-white shadow-xl shadow-blue-600/25 transition duration-300 hover:-translate-y-0.5 hover:bg-[#0047d6] active:translate-y-0"
        >
          Все категории
          <ArrowRight
            size={16}
            className="transition duration-300 group-hover:translate-x-1"
          />
        </button>
      </div>

      <div className="relative grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {categories.map((category, index) => {
          const title = getTitle(category);
          const count = getSubCount(category);
          const Icon = getIcon(title);
          const active = selectedCategory === title;
          const preview = getPreviewSubcategories(category);

          return (
            <button
              key={`${title}-${index}`}
              type="button"
              onClick={() => onSelectCategory?.(title)}
              className={[
                "group relative overflow-hidden rounded-[32px] border p-5 text-left transition duration-300",
                "min-h-[190px] bg-white shadow-[0_18px_55px_rgba(15,23,42,0.07)]",
                "hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_24px_70px_rgba(0,87,255,0.16)]",
                active
                  ? "border-[#0057ff] bg-[#0057ff] text-white shadow-[0_24px_70px_rgba(0,87,255,0.28)]"
                  : "border-slate-100 text-slate-950",
              ].join(" ")}
            >
              <div
                className={[
                  "pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full transition duration-500",
                  active
                    ? "bg-white/15"
                    : "bg-[radial-gradient(circle,rgba(0,87,255,0.12),transparent_64%)] group-hover:scale-125",
                ].join(" ")}
              />

              <div
                className={[
                  "pointer-events-none absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100",
                  active
                    ? "bg-[linear-gradient(135deg,rgba(255,255,255,0.12),transparent_55%)]"
                    : "bg-[linear-gradient(135deg,rgba(0,87,255,0.08),transparent_45%)]",
                ].join(" ")}
              />

              <div className="relative flex items-start justify-between gap-4">
                <div
                  className={[
                    "flex h-14 w-14 items-center justify-center rounded-2xl transition duration-300",
                    active
                      ? "bg-white text-[#0057ff]"
                      : "bg-[#eff6ff] text-[#0057ff] group-hover:bg-[#0057ff] group-hover:text-white",
                  ].join(" ")}
                >
                  <Icon size={27} strokeWidth={2.7} />
                </div>

                <div
                  className={[
                    "flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-black",
                    active
                      ? "bg-white/15 text-white"
                      : "bg-slate-50 text-slate-500",
                  ].join(" ")}
                >
                  <BadgeCheck size={13} strokeWidth={2.8} />
                  Раздел
                </div>
              </div>

              <div className="relative mt-7">
                <h3
                  className={[
                    "max-w-[210px] text-[22px] font-black leading-[1.05] tracking-tight",
                    active ? "text-white" : "text-slate-950",
                  ].join(" ")}
                >
                  {title}
                </h3>

                <div className="mt-3 flex items-center gap-2">
                  <CheckCircle2
                    size={16}
                    strokeWidth={2.7}
                    className={active ? "text-white/90" : "text-[#0057ff]"}
                  />
                  <p
                    className={[
                      "text-sm font-black",
                      active ? "text-white/85" : "text-slate-500",
                    ].join(" ")}
                  >
                    {count} подкатегорий
                  </p>
                </div>

                {preview.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {preview.map((item) => (
                      <span
                        key={item}
                        className={[
                          "max-w-full truncate rounded-full px-3 py-1 text-[11px] font-black",
                          active
                            ? "bg-white/15 text-white"
                            : "bg-slate-50 text-slate-500",
                        ].join(" ")}
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div
                className={[
                  "absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-2xl transition duration-300",
                  active
                    ? "bg-white text-[#0057ff]"
                    : "bg-[#f8fafc] text-slate-400 group-hover:bg-[#0057ff] group-hover:text-white",
                ].join(" ")}
              >
                <ArrowRight
                  size={18}
                  strokeWidth={2.8}
                  className="transition duration-300 group-hover:translate-x-0.5"
                />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
