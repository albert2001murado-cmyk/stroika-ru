"use client";

import { ArrowLeft, ArrowRight, Search, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

type CategoryLike = {
  id?: string;
  title?: string;
  name?: string;
  icon?: ReactNode;
  emoji?: string;
  subcategories?: string[];
  count?: number;
};

type CategorySelection = {
  category: string;
  subcategory?: string;
  search?: string;
};

type Props = {
  categories: CategoryLike[];
  selectedCategory?: string;
  selectedSubcategory?: string;
  onSelectCategory?: (category: string) => void;
  onApplySelection?: (selection: CategorySelection) => void;
  className?: string;
};

type SectionId = "materials" | "services" | "machinery" | "complex";

type SectionConfig = {
  id: SectionId;
  title: string;
  description: string;
  image: string;
  keys: string[];
};

const sections: SectionConfig[] = [
  {
    id: "materials",
    title: "Материалы",
    description: "Бетон, кирпич, отделка и инженерные материалы",
    image: "/categories/materials.png",
    keys: ["материал"],
  },
  {
    id: "services",
    title: "Услуги",
    description: "Мастера и бригады для отдельных строительных работ",
    image: "/categories/finishing.png",
    keys: ["отдел", "элект", "сант", "пол", "крыша", "фасад", "участок", "благоустрой", "инженер", "окна", "двер", "мебель", "дополнитель"],
  },
  {
    id: "machinery",
    title: "Техника",
    description: "Спецтехника, доставка и работа с оператором",
    image: "/categories/equipment.png",
    keys: ["спецтехника"],
  },
  {
    id: "complex",
    title: "Комплексные решения",
    description: "Ремонт, строительство и работы под ключ",
    image: "/categories/construction.png",
    keys: ["ремонт квартир", "строительство"],
  },
];

function normalize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(value: string) {
  return value.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

function getTitle(category: CategoryLike) {
  return category.title || category.name || "Категория";
}

const CATEGORY_IMAGES = {
  materials: "/categories/materials.png",
  repair: "/categories/repair.png",
  finishing: "/categories/finishing.png",
  electric: "/categories/electric.png",
  plumbing: "/categories/plumbing.png",
  construction: "/categories/construction.png",
  equipment: "/categories/equipment.png",
  design: "/categories/design.png",
  engineering: "/categories/engineering.png",
  windows: "/categories/windows.png",
  furniture: "/categories/furniture.png",
  extra: "/categories/extra.png",
  all: "/categories/all.png",
} as const;

function getCategoryImage(title: string) {
  const value = normalize(title);

  if (value.includes("материал")) return CATEGORY_IMAGES.materials;
  if (value.includes("ремонт квартир")) return CATEGORY_IMAGES.repair;
  if (value.includes("отдел") || value.includes("пол")) return CATEGORY_IMAGES.finishing;
  if (value.includes("элект")) return CATEGORY_IMAGES.electric;
  if (value.includes("сант")) return CATEGORY_IMAGES.plumbing;
  if (value.includes("спец") || value.includes("техника")) return CATEGORY_IMAGES.equipment;
  if (value.includes("участок") || value.includes("благоустрой")) return CATEGORY_IMAGES.design;
  if (value.includes("инженер")) return CATEGORY_IMAGES.engineering;
  if (value.includes("окна") || value.includes("двер")) return CATEGORY_IMAGES.windows;
  if (value.includes("мебель")) return CATEGORY_IMAGES.furniture;
  if (value.includes("дополнитель")) return CATEGORY_IMAGES.extra;
  if (value.includes("стро") || value.includes("крыша") || value.includes("фасад")) return CATEGORY_IMAGES.construction;

  return CATEGORY_IMAGES.repair;
}

function getCount(category: CategoryLike) {
  return typeof category.count === "number" ? category.count : category.subcategories?.length || 0;
}

function getPopular(category: CategoryLike) {
  const all = category.subcategories || [];
  if (!normalize(getTitle(category)).includes("материал")) return all.slice(0, 16);

  const preferred = [
    "Бетон",
    "Цемент",
    "Кирпич",
    "Арматура",
    "Газобетонные блоки",
    "Песок",
    "Щебень",
    "Пиломатериалы",
    "Кровельные материалы",
    "Кабель и провод",
    "Трубы водопроводные",
    "Утеплитель минеральная вата",
  ];

  const found = preferred.filter((item) => all.includes(item));
  return [...found, ...all.filter((item) => !found.includes(item))].slice(0, 18);
}

function buildActions(category: CategoryLike, subcategory: string): Array<{
  title: string;
  description: string;
  image: string;
  selection: CategorySelection;
}> {
  const categoryName = getTitle(category);
  const normalized = normalize(categoryName);
  const subject = subcategory || cleanTitle(categoryName);

  if (normalized.includes("материал")) {
    return [
      {
        title: `Купить ${subject.toLowerCase()}`,
        description: "Продавцы и производители",
        image: CATEGORY_IMAGES.materials,
        selection: { category: categoryName, subcategory },
      },
      {
        title: "Заказать доставку",
        description: `Доставка: ${subject.toLowerCase()}`,
        image: CATEGORY_IMAGES.extra,
        selection: { category: categoryName, subcategory, search: `${subject} доставка` },
      },
      {
        title: "Найти специалистов",
        description: `Исполнители, которые работают с «${subject}»`,
        image: CATEGORY_IMAGES.repair,
        selection: { category: "", search: subject },
      },
      {
        title: "Показать все предложения",
        description: "Все объявления по выбранному материалу",
        image: CATEGORY_IMAGES.all,
        selection: { category: categoryName, subcategory },
      },
    ];
  }

  if (normalized.includes("спецтехника")) {
    return [
      {
        title: `Арендовать ${subject.toLowerCase()}`,
        description: "Предложения техники рядом",
        image: CATEGORY_IMAGES.equipment,
        selection: { category: categoryName, subcategory },
      },
      {
        title: "Заказать с оператором",
        description: "Работа на объекте с опытным специалистом",
        image: CATEGORY_IMAGES.repair,
        selection: { category: categoryName, subcategory, search: `${subject} оператор` },
      },
      {
        title: "Заказать доставку техники",
        description: "Перевозка техники до объекта",
        image: CATEGORY_IMAGES.extra,
        selection: { category: categoryName, subcategory, search: `${subject} доставка` },
      },
    ];
  }

  if (normalized.includes("элект")) {
    return [
      {
        title: "Найти электрика",
        description: "Частные мастера, ИП и компании",
        image: CATEGORY_IMAGES.electric,
        selection: { category: categoryName, subcategory },
      },
      {
        title: "Купить материалы",
        description: "Кабель, автоматы, розетки и освещение",
        image: CATEGORY_IMAGES.materials,
        selection: { category: "🧰 Материалы", search: "электрика кабель розетки" },
      },
      {
        title: "Электромонтаж под ключ",
        description: "Полный комплекс работ на объекте",
        image: CATEGORY_IMAGES.construction,
        selection: { category: categoryName, search: "под ключ" },
      },
    ];
  }

  if (normalized.includes("строительство")) {
    return [
      {
        title: "Заказать строительство",
        description: "Подрядчики и бригады",
        image: CATEGORY_IMAGES.repair,
        selection: { category: categoryName, subcategory },
      },
      {
        title: "Найти материалы",
        description: "Материалы для выбранной работы",
        image: CATEGORY_IMAGES.materials,
        selection: { category: "🧰 Материалы", search: subject },
      },
      {
        title: "Заказать технику",
        description: "Экскаваторы, краны и другая спецтехника",
        image: CATEGORY_IMAGES.equipment,
        selection: { category: "🚜 Спецтехника", search: subject },
      },
      {
        title: "Рассчитать стоимость",
        description: "Найти исполнителя для оценки и сметы",
        image: CATEGORY_IMAGES.design,
        selection: { category: categoryName, search: `${subject} стоимость` },
      },
    ];
  }

  return [
    {
      title: "Найти исполнителя",
      description: `Мастера и компании: ${subject.toLowerCase()}`,
      image: CATEGORY_IMAGES.repair,
      selection: { category: categoryName, subcategory },
    },
    {
      title: "Заказать работу под ключ",
      description: "Полный комплекс работ одним исполнителем",
      image: CATEGORY_IMAGES.construction,
      selection: { category: categoryName, search: "под ключ" },
    },
    {
      title: "Показать все объявления",
      description: "Все предложения в выбранной категории",
      image: CATEGORY_IMAGES.design,
      selection: { category: categoryName, subcategory },
    },
  ];
}

export default function PremiumCategoryGrid({
  categories,
  selectedCategory,
  selectedSubcategory,
  onSelectCategory,
  onApplySelection,
  className = "",
}: Props) {
  const [sectionId, setSectionId] = useState<SectionId | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [search, setSearch] = useState("");

  const section = sections.find((item) => item.id === sectionId) || null;
  const activeCategory = categories.find((item) => getTitle(item) === categoryName);

  const sectionCategories = useMemo(() => {
    if (!section) return [];
    return categories.filter((item) => {
      const title = normalize(getTitle(item));
      return section.keys.some((key) => title.includes(normalize(key)));
    });
  }, [categories, section]);

  const visibleSubcategories = useMemo(() => {
    if (!activeCategory) return [];
    const all = activeCategory.subcategories || [];
    const value = normalize(search);
    if (!value) return getPopular(activeCategory);
    return all.filter((item) => normalize(item).includes(value)).slice(0, 24);
  }, [activeCategory, search]);

  const actions = activeCategory ? buildActions(activeCategory, subcategory) : [];

  function resetAll() {
    setSectionId(null);
    setCategoryName("");
    setSubcategory("");
    setSearch("");
    onSelectCategory?.("");
    onApplySelection?.({ category: "", subcategory: "", search: "" });
  }

  function goBack() {
    if (subcategory) return setSubcategory("");
    if (categoryName) {
      setCategoryName("");
      setSearch("");
      return;
    }
    setSectionId(null);
  }

  function apply(selection: CategorySelection) {
    onSelectCategory?.(selection.category);
    onApplySelection?.(selection);
    window.requestAnimationFrame(() => {
      document.getElementById("recommended-listings")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const heading = subcategory
    ? subcategory
    : activeCategory
      ? cleanTitle(getTitle(activeCategory))
      : section
        ? section.title
        : "Что вам нужно?";

  const subtitle = subcategory
    ? "Выберите подходящее действие"
    : activeCategory
      ? "Выберите конкретную услугу или товар"
      : section
        ? "Выберите направление внутри раздела"
        : "Сначала выберите один из четырёх понятных разделов";

  return (
    <section className={`relative ${className}`}>
      <div className="pointer-events-none absolute inset-x-0 -top-10 h-44 rounded-[48px] bg-[radial-gradient(circle_at_15%_15%,rgba(0,87,255,0.15),transparent_36%),radial-gradient(circle_at_85%_0%,rgba(56,189,248,0.13),transparent_34%)] blur-2xl" />

      <div className="relative overflow-hidden rounded-[36px] border border-blue-100 bg-white p-5 shadow-[0_24px_75px_rgba(15,23,42,0.08)] sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#0057ff]">
              <ShieldCheck size={15} strokeWidth={2.7} />
              Удобный каталог
            </div>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{heading}</h2>
            <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-slate-500 sm:text-base">{subtitle}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {sectionId ? (
              <button type="button" onClick={goBack} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:text-[#0057ff]">
                <ArrowLeft size={17} strokeWidth={2.8} />
                Назад
              </button>
            ) : null}

            <button type="button" onClick={resetAll} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#0057ff] px-5 text-sm font-black text-white shadow-xl shadow-blue-600/20 transition duration-300 hover:-translate-y-0.5 hover:bg-[#0047d6]">
              Все объявления
              <ArrowRight size={16} strokeWidth={2.8} />
            </button>
          </div>
        </div>

        <div key={`${sectionId}-${categoryName}-${subcategory}`} className="category-stage relative mt-7">
          {!sectionId ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {sections.map(({ id, title, description, image }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSectionId(id)}
                  className="group relative min-h-[228px] overflow-hidden rounded-[30px] border border-slate-100 bg-[#f8fbff] p-5 text-left transition duration-500 ease-out hover:-translate-y-1.5 hover:border-blue-200 hover:bg-white hover:shadow-[0_26px_70px_rgba(0,87,255,0.16)] active:scale-[0.975]"
                >
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_82%,rgba(0,87,255,0.13),transparent_42%)] opacity-70 transition duration-500 group-hover:opacity-100" />

                  <div className="relative z-10 max-w-[66%]">
                    <h3 className="text-2xl font-black tracking-tight text-slate-950">{title}</h3>
                    <p className="mt-3 text-sm font-bold leading-6 text-slate-500">{description}</p>
                  </div>

                  <img
                    src={image}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-4 -right-3 h-[154px] w-[154px] object-contain drop-shadow-[0_20px_22px_rgba(15,23,42,0.2)] transition duration-500 ease-out group-hover:-translate-x-1.5 group-hover:-translate-y-2 group-hover:rotate-[-1deg] group-hover:scale-[1.07]"
                  />
                </button>
              ))}
            </div>
          ) : null}

          {sectionId && !activeCategory ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sectionCategories.map((category, index) => {
                const title = getTitle(category);
                const image = getCategoryImage(title);
                const active = selectedCategory === title;

                return (
                  <button
                    key={`${title}-${index}`}
                    type="button"
                    onClick={() => setCategoryName(title)}
                    className={[
                      "group relative min-h-[184px] overflow-hidden rounded-[28px] border p-5 text-left transition duration-500 ease-out hover:-translate-y-1.5 hover:shadow-[0_24px_60px_rgba(0,87,255,0.15)] active:scale-[0.98]",
                      active
                        ? "border-[#0057ff] bg-[#0057ff] text-white"
                        : "border-slate-100 bg-[#f8fbff] text-slate-950 hover:border-blue-200 hover:bg-white",
                    ].join(" ")}
                  >
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_82%,rgba(0,87,255,0.12),transparent_44%)] opacity-70 transition duration-500 group-hover:opacity-100" />

                    <span
                      className={[
                        "relative z-10 inline-flex rounded-full px-3 py-1 text-[11px] font-black",
                        active ? "bg-white/15 text-white" : "bg-white text-slate-500",
                      ].join(" ")}
                    >
                      {getCount(category)} вариантов
                    </span>

                    <h3
                      className={[
                        "relative z-10 mt-5 max-w-[62%] text-xl font-black leading-tight",
                        active ? "text-white" : "text-slate-950",
                      ].join(" ")}
                    >
                      {cleanTitle(title)}
                    </h3>

                    <img
                      src={image}
                      alt=""
                      aria-hidden="true"
                      className="pointer-events-none absolute -bottom-4 -right-2 h-[126px] w-[126px] object-contain drop-shadow-[0_16px_18px_rgba(15,23,42,0.18)] transition duration-500 ease-out group-hover:-translate-x-1 group-hover:-translate-y-2 group-hover:rotate-[-1deg] group-hover:scale-[1.08]"
                    />
                  </button>
                );
              })}
            </div>
          ) : null}

          {activeCategory && !subcategory ? (
            <div>
              {(activeCategory.subcategories?.length || 0) > 10 ? (
                <div className="relative mb-5">
                  <Search size={20} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Найти внутри «${cleanTitle(getTitle(activeCategory))}»`} className="h-14 w-full rounded-2xl border border-slate-200 bg-[#f8fafc] pl-14 pr-5 text-sm font-bold text-slate-950 outline-none transition focus:border-[#0057ff] focus:bg-white focus:ring-4 focus:ring-blue-100" />
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleSubcategories.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setSubcategory(item)}
                    className={[
                      "group flex min-h-16 items-center rounded-2xl border px-5 py-3 text-left transition duration-300 ease-out hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-900/5 active:scale-[0.985]",
                      selectedSubcategory === item
                        ? "border-[#0057ff] bg-[#0057ff] text-white"
                        : "border-slate-200 bg-white text-slate-800",
                    ].join(" ")}
                  >
                    <span className="font-black leading-5 transition duration-300 group-hover:translate-x-1">{item}</span>
                  </button>
                ))}
              </div>

              {visibleSubcategories.length === 0 ? (
                <div className="rounded-[26px] border border-dashed border-blue-200 bg-blue-50/50 p-8 text-center">
                  <Search size={28} className="mx-auto text-[#0057ff]" />
                  <p className="mt-3 font-black text-slate-950">Ничего не найдено</p>
                  <p className="mt-1 text-sm font-bold text-slate-500">Попробуйте изменить запрос.</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeCategory && subcategory ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {actions.map((action, index) => (
                <button
                  key={`${action.title}-${index}`}
                  type="button"
                  onClick={() => apply(action.selection)}
                  className="group relative min-h-[142px] overflow-hidden rounded-[28px] border border-slate-100 bg-[#f8fbff] p-5 text-left transition duration-500 ease-out hover:-translate-y-1.5 hover:border-blue-200 hover:bg-white hover:shadow-[0_24px_60px_rgba(0,87,255,0.15)] active:scale-[0.98]"
                >
                  <span className="relative z-10 block max-w-[68%]">
                    <span className="block text-lg font-black text-slate-950">{action.title}</span>
                    <span className="mt-2 block text-sm font-bold leading-5 text-slate-500">{action.description}</span>
                  </span>

                  <img
                    src={action.image}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-3 -right-1 h-[112px] w-[112px] object-contain drop-shadow-[0_15px_18px_rgba(15,23,42,0.18)] transition duration-500 ease-out group-hover:-translate-x-1 group-hover:-translate-y-2 group-hover:rotate-[-1deg] group-hover:scale-[1.08]"
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <style jsx>{`
        @keyframes categoryStageIn {
          from { opacity: 0; transform: translateY(10px) scale(0.992); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .category-stage { animation: categoryStageIn 260ms ease-out both; }
      `}</style>
    </section>
  );
}
