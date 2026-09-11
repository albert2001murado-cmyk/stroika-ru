"use client";

import {
  CATALOG_FORM_SECTIONS,
  getCatalogFormCategories,
  type CatalogFormCategory,
  type CatalogSectionId,
} from "@/data/catalogForm";
import { Check, ChevronRight, Search, X } from "lucide-react";

const SECTION_ICONS: Record<CatalogSectionId, string> = {
  materials: "🧱",
  services: "🛠️",
  equipment: "🚜",
  solutions: "🏗️",
};

function normalize(value: unknown) {
  return String(value || "")
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export default function CatalogSearchFilter({
  section,
  categoryId,
  subcategory,
  query,
  onSelectSection,
  onSelectCategory,
  onSelectSubcategory,
  onQueryChange,
}: {
  section: CatalogSectionId | "";
  categoryId: string;
  subcategory: string;
  query: string;
  onSelectSection: (section: CatalogSectionId) => void;
  onSelectCategory: (category: CatalogFormCategory | null) => void;
  onSelectSubcategory: (subcategory: string) => void;
  onQueryChange: (query: string) => void;
}) {
  const categories = section ? getCatalogFormCategories(section) : [];
  const selected = categories.find((item) => item.id === categoryId) || null;
  const normalizedQuery = normalize(query);
  const visibleCategories = normalizedQuery
    ? categories.filter((item) =>
        normalize([item.title, item.description, ...item.subcategories].join(" ")).includes(
          normalizedQuery
        )
      )
    : categories;
  const visibleSubcategories = selected
    ? selected.subcategories.filter((item) =>
        normalizedQuery ? normalize(item).includes(normalizedQuery) : true
      )
    : [];

  return (
    <section className="rounded-[28px] border border-blue-100 bg-[linear-gradient(145deg,#f5f9ff_0%,#ffffff_58%,#eef7ff_100%)] p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0057ff]">
            Каталог
          </p>
          <h3 className="mt-1 text-xl font-black text-slate-950">
            Выберите точное направление
          </h3>
        </div>
        <p className="text-xs font-bold text-slate-500">
          Раздел → категория → подкатегория
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {CATALOG_FORM_SECTIONS.map((item) => {
          const active = item.id === section;
          const count = getCatalogFormCategories(item.id).length;
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => onSelectSection(item.id)}
              className={`group min-h-[104px] rounded-[22px] border p-3 text-left transition duration-300 hover:-translate-y-0.5 active:scale-[0.98] ${
                active
                  ? "border-[#0057ff] bg-[#0057ff] text-white shadow-lg shadow-blue-600/20"
                  : "border-white bg-white text-slate-900 shadow-sm hover:border-blue-200"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-2xl transition duration-300 group-hover:scale-110">
                  {SECTION_ICONS[item.id]}
                </span>
                {active ? <Check size={17} strokeWidth={3} /> : null}
              </div>
              <span className="mt-2 block text-sm font-black leading-4">{item.title}</span>
              <span className={`mt-1 block text-[11px] font-bold ${active ? "text-blue-100" : "text-slate-400"}`}>
                {count} {count === 1 ? "направление" : "направлений"}
              </span>
            </button>
          );
        })}
      </div>

      {section ? (
        <div className="mt-4">
          <label className="flex min-h-13 items-center gap-3 rounded-2xl border border-blue-100 bg-white px-4 shadow-sm transition focus-within:border-[#0057ff] focus-within:ring-4 focus-within:ring-blue-100">
            <Search size={18} className="shrink-0 text-[#0057ff]" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={selected ? "Найти подкатегорию" : "Найти категорию или работу"}
              className="min-h-13 min-w-0 flex-1 border-0 bg-transparent text-sm font-bold text-slate-900 outline-none placeholder:text-slate-400"
            />
            {query ? (
              <button type="button" onClick={() => onQueryChange("")} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
                <X size={17} />
              </button>
            ) : null}
          </label>
        </div>
      ) : null}

      {section && !selected ? (
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {visibleCategories.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => {
                onSelectCategory(item);
                onQueryChange("");
              }}
              className="group flex min-h-[86px] items-center gap-3 rounded-[20px] border border-white bg-white p-3 text-left shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md active:scale-[0.99]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-xl">
                {SECTION_ICONS[section]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-slate-900">{item.title}</span>
                <span className="mt-1 line-clamp-2 block text-[11px] font-bold leading-4 text-slate-400">
                  {item.description}
                </span>
              </span>
              <ChevronRight size={19} className="shrink-0 text-[#0057ff] transition group-hover:translate-x-0.5" />
            </button>
          ))}
          {visibleCategories.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-blue-200 bg-white p-5 text-sm font-bold text-slate-500 md:col-span-2 xl:col-span-3">
              По этому запросу категорий не найдено.
            </div>
          ) : null}
        </div>
      ) : null}

      {selected ? (
        <div className="mt-4">
          <div className="flex items-center gap-3 rounded-[20px] border border-blue-100 bg-white p-3 shadow-sm">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-2xl">
              {SECTION_ICONS[section as CatalogSectionId]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[#0057ff]">Выбрано</p>
              <p className="mt-0.5 truncate text-sm font-black text-slate-950">{selected.title}</p>
            </div>
            <button type="button" onClick={() => { onSelectCategory(null); onQueryChange(""); }} className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-[#0057ff] transition hover:bg-blue-100">
              Изменить
            </button>
          </div>

          <div className="mt-3 flex max-h-48 flex-wrap gap-2 overflow-y-auto pr-1">
            <button
              type="button"
              onClick={() => onSelectSubcategory("")}
              className={`rounded-full border px-3 py-2 text-xs font-black transition active:scale-95 ${
                !subcategory
                  ? "border-[#0057ff] bg-[#0057ff] text-white"
                  : "border-blue-100 bg-white text-slate-600 hover:border-blue-300"
              }`}
            >
              Все
            </button>
            {visibleSubcategories.map((item) => {
              const active = item === subcategory;
              return (
                <button
                  type="button"
                  key={item}
                  onClick={() => onSelectSubcategory(active ? "" : item)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-black transition active:scale-95 ${
                    active
                      ? "border-[#0057ff] bg-[#0057ff] text-white"
                      : "border-blue-100 bg-white text-slate-700 hover:border-blue-300 hover:text-[#0057ff]"
                  }`}
                >
                  {active ? <Check size={13} strokeWidth={3} /> : null}
                  {item}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
