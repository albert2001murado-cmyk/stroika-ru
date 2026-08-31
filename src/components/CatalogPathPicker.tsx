"use client";

import {
  Building2,
  Check,
  ChevronRight,
  Layers3,
  PackageOpen,
  Search,
  Truck,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  CATALOG_FORM_SECTIONS,
  getCatalogFormCategories,
  getCatalogSectionTitle,
  getDefaultCatalogPath,
} from "@/data/catalogForm";
import type { CatalogPathValue, CatalogSectionId } from "@/data/catalogForm";

type CatalogPathPickerProps = {
  value: CatalogPathValue;
  onChange: (value: CatalogPathValue) => void;
  mode: "executor" | "customer";
};

const SECTION_ICONS = {
  materials: PackageOpen,
  services: Wrench,
  equipment: Truck,
  solutions: Building2,
} satisfies Record<CatalogSectionId, typeof Wrench>;

function normalize(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е");
}

export default function CatalogPathPicker({
  value,
  onChange,
  mode,
}: CatalogPathPickerProps) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const categoryOptions = useMemo(
    () => getCatalogFormCategories(value.catalogSection),
    [value.catalogSection]
  );
  const activeCategory =
    categoryOptions.find((item) => item.id === value.catalogCategoryId) ||
    categoryOptions[0];
  const filteredSubcategories = useMemo(() => {
    const search = normalize(query);
    const items = activeCategory?.subcategories || [];
    if (!search) return items;
    return items.filter((item) => normalize(item).includes(search));
  }, [activeCategory, query]);
  const visibleSubcategories =
    query || showAll || filteredSubcategories.length <= 18
      ? filteredSubcategories
      : filteredSubcategories.slice(0, 18);
  const path = [
    getCatalogSectionTitle(value.catalogSection),
    value.catalogCategoryTitle,
    value.subcategory,
  ].filter(Boolean);

  function selectSection(sectionId: CatalogSectionId) {
    setQuery("");
    setShowAll(false);
    onChange(getDefaultCatalogPath(sectionId));
  }

  function selectCategory(categoryId: string) {
    const option = categoryOptions.find((item) => item.id === categoryId);
    if (!option) return;
    setQuery("");
    setShowAll(false);
    onChange({
      catalogSection: value.catalogSection,
      catalogCategoryId: option.id,
      catalogCategoryTitle: option.title,
      catalogGroupId: option.groupId,
      category: option.category,
      subcategory: option.subcategories[0] || "",
    });
  }

  return (
    <section className="overflow-hidden rounded-[28px] border border-blue-100 bg-[linear-gradient(145deg,#f3f8ff_0%,#ffffff_56%,#eef5ff_100%)] p-4 shadow-[0_18px_55px_rgba(0,87,255,0.08)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0057ff]">
            Точный путь в каталоге
          </p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">
            {mode === "executor"
              ? "Где показывать вашу анкету?"
              : "Что именно вам требуется?"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-slate-500">
            {mode === "executor"
              ? "Выберите каталог, категорию и конкретное направление — клиенты быстрее найдут ваше предложение."
              : "Выберите точное направление задачи — заявка попадёт к подходящим исполнителям."}
          </p>
        </div>
        <div className="inline-flex shrink-0 items-center gap-2 self-start rounded-2xl bg-white px-4 py-3 text-xs font-black text-[#0057ff] shadow-sm ring-1 ring-blue-100">
          <Layers3 size={17} />
          3 простых шага
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0057ff] text-xs font-black text-white">1</span>
          <div>
            <h3 className="font-black text-slate-950">Каталог</h3>
            <p className="text-xs font-bold text-slate-500">Выберите тип предложения или задачи</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {CATALOG_FORM_SECTIONS.map((section) => {
            const Icon = SECTION_ICONS[section.id];
            const active = section.id === value.catalogSection;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => selectSection(section.id)}
                className={[
                  "group min-h-[116px] rounded-[22px] border p-4 text-left transition duration-300 ease-out hover:-translate-y-1 active:scale-[0.98]",
                  active
                    ? "border-[#0057ff] bg-[#0057ff] text-white shadow-xl shadow-blue-600/20"
                    : "border-white bg-white text-slate-950 shadow-sm hover:border-blue-200 hover:shadow-lg",
                ].join(" ")}
              >
                <span className={[
                  "flex h-10 w-10 items-center justify-center rounded-2xl transition duration-300",
                  active ? "bg-white text-[#0057ff]" : "bg-blue-50 text-[#0057ff]",
                ].join(" ")}>
                  {active ? <Check size={19} strokeWidth={3} /> : <Icon size={20} strokeWidth={2.6} />}
                </span>
                <span className="mt-3 block text-sm font-black">{section.title}</span>
                <span className={[
                  "mt-1 block text-[11px] font-bold leading-4",
                  active ? "text-blue-100" : "text-slate-500",
                ].join(" ")}>
                  {section.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div key={`${value.catalogSection}-${value.catalogCategoryId}`} className="catalog-picker-reveal mt-7">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-xs font-black text-[#0057ff]">2</span>
          <div>
            <h3 className="font-black text-slate-950">Категория</h3>
            <p className="text-xs font-bold text-slate-500">Уточните основное направление</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {categoryOptions.map((option) => {
            const active = option.id === value.catalogCategoryId;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => selectCategory(option.id)}
                className={[
                  "rounded-2xl border px-4 py-3 text-left transition duration-300 active:scale-[0.98]",
                  active
                    ? "border-[#0057ff] bg-blue-50 text-[#0057ff] shadow-sm"
                    : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-[#0057ff]",
                ].join(" ")}
              >
                <span className="flex items-center gap-2 text-sm font-black">
                  {active ? <Check size={16} strokeWidth={3} /> : null}
                  {option.title}
                </span>
                <span className="mt-1 block text-[11px] font-bold text-slate-500">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="catalog-picker-reveal mt-7">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-xs font-black text-[#0057ff]">3</span>
            <div>
              <h3 className="font-black text-slate-950">Подкатегория</h3>
              <p className="text-xs font-bold text-slate-500">Выберите конкретную работу, материал или технику</p>
            </div>
          </div>
          <div className="relative w-full sm:w-[310px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#0057ff]" size={18} />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setShowAll(false);
              }}
              placeholder="Найти подкатегорию"
              className="h-12 w-full rounded-2xl border border-blue-100 bg-white pl-11 pr-10 text-sm font-bold text-slate-950 outline-none transition focus:border-[#0057ff] focus:ring-4 focus:ring-blue-100"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-blue-50 hover:text-[#0057ff]"
              >
                <X size={15} />
              </button>
            ) : null}
          </div>
        </div>

        {visibleSubcategories.length ? (
          <div className="flex flex-wrap gap-2">
            {visibleSubcategories.map((item) => {
              const active = item === value.subcategory;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => onChange({ ...value, subcategory: item })}
                  className={[
                    "rounded-full border px-4 py-2.5 text-sm font-black transition duration-300 active:scale-95",
                    active
                      ? "border-[#0057ff] bg-[#0057ff] text-white shadow-lg shadow-blue-500/20"
                      : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-[#0057ff]",
                  ].join(" ")}
                >
                  {item}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-blue-200 bg-white/70 p-6 text-center">
            <Search className="mx-auto text-[#0057ff]" size={24} />
            <p className="mt-2 font-black text-slate-950">Ничего не найдено</p>
            <p className="mt-1 text-xs font-bold text-slate-500">Попробуйте ввести часть названия.</p>
          </div>
        )}

        {!query && filteredSubcategories.length > 18 ? (
          <button
            type="button"
            onClick={() => setShowAll((current) => !current)}
            className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#0057ff] shadow-sm ring-1 ring-blue-100 transition hover:-translate-y-0.5"
          >
            {showAll ? "Свернуть список" : `Показать все (${filteredSubcategories.length})`}
          </button>
        ) : null}
      </div>

      <div className="mt-7 rounded-[22px] border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Выбранный путь</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-black text-slate-950">
          {path.map((segment, index) => (
            <span key={`${segment}-${index}`} className="inline-flex items-center gap-2">
              {index > 0 ? <ChevronRight size={16} className="text-[#0057ff]" /> : null}
              <span className={index === path.length - 1 ? "text-[#0057ff]" : ""}>{segment}</span>
            </span>
          ))}
        </div>
      </div>

      <style jsx>{`
        .catalog-picker-reveal {
          animation: catalog-picker-reveal 280ms ease-out both;
        }
        @keyframes catalog-picker-reveal {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .catalog-picker-reveal { animation: none; }
        }
      `}</style>
    </section>
  );
}
