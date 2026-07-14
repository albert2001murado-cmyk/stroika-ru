"use client";

import {
  ArrowLeft,
  ArrowRight,
  Blocks,
  Bolt,
  Building2,
  ChevronRight,
  DoorOpen,
  Hammer,
  HardHat,
  Home,
  Layers3,
  Paintbrush,
  PlugZap,
  Ruler,
  Search,
  ShieldCheck,
  ShowerHead,
  Sofa,
  Sparkles,
  Truck,
  Wrench,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
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
  Icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  keys: string[];
};

const sections: SectionConfig[] = [
  {
    id: "materials",
    title: "Материалы",
    description: "Бетон, кирпич, отделка и инженерные материалы",
    Icon: Blocks,
    keys: ["материал"],
  },
  {
    id: "services",
    title: "Услуги",
    description: "Мастера и бригады для отдельных строительных работ",
    Icon: Wrench,
    keys: ["отдел", "элект", "сант", "пол", "крыша", "фасад", "участок", "благоустрой", "инженер", "окна", "двер", "мебель", "дополнитель"],
  },
  {
    id: "machinery",
    title: "Техника",
    description: "Спецтехника, доставка и работа с оператором",
    Icon: Truck,
    keys: ["спецтехника"],
  },
  {
    id: "complex",
    title: "Комплексные решения",
    description: "Ремонт, строительство и работы под ключ",
    Icon: HardHat,
    keys: ["ремонт квартир", "строительство"],
  },
];

const iconByName: Array<{
  keys: string[];
  Icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
}> = [
  { keys: ["ремонт"], Icon: Home },
  { keys: ["отдел"], Icon: Paintbrush },
  { keys: ["элект"], Icon: Bolt },
  { keys: ["сант"], Icon: ShowerHead },
  { keys: ["стро"], Icon: HardHat },
  { keys: ["спец", "техника"], Icon: Truck },
  { keys: ["материал"], Icon: Blocks },
  { keys: ["пол"], Icon: Layers3 },
  { keys: ["крыша", "фасад"], Icon: Building2 },
  { keys: ["участок", "благоустрой"], Icon: Ruler },
  { keys: ["инженер"], Icon: PlugZap },
  { keys: ["окна", "двер"], Icon: DoorOpen },
  { keys: ["мебель"], Icon: Sofa },
  { keys: ["дополнитель"], Icon: Sparkles },
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

function getIcon(title: string) {
  const value = normalize(title);
  return iconByName.find((item) => item.keys.some((key) => value.includes(key)))?.Icon || Hammer;
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
  icon: string;
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
        icon: "🧱",
        selection: { category: categoryName, subcategory },
      },
      {
        title: "Заказать доставку",
        description: `Доставка: ${subject.toLowerCase()}`,
        icon: "🚚",
        selection: { category: categoryName, subcategory, search: `${subject} доставка` },
      },
      {
        title: "Найти специалистов",
        description: `Исполнители, которые работают с «${subject}»`,
        icon: "👷",
        selection: { category: "", search: subject },
      },
      {
        title: "Показать все предложения",
        description: "Все объявления по выбранному материалу",
        icon: "📦",
        selection: { category: categoryName, subcategory },
      },
    ];
  }

  if (normalized.includes("спецтехника")) {
    return [
      {
        title: `Арендовать ${subject.toLowerCase()}`,
        description: "Предложения техники рядом",
        icon: "🚜",
        selection: { category: categoryName, subcategory },
      },
      {
        title: "Заказать с оператором",
        description: "Работа на объекте с опытным специалистом",
        icon: "👷",
        selection: { category: categoryName, subcategory, search: `${subject} оператор` },
      },
      {
        title: "Заказать доставку техники",
        description: "Перевозка техники до объекта",
        icon: "🚛",
        selection: { category: categoryName, subcategory, search: `${subject} доставка` },
      },
    ];
  }

  if (normalized.includes("элект")) {
    return [
      {
        title: "Найти электрика",
        description: "Частные мастера, ИП и компании",
        icon: "⚡",
        selection: { category: categoryName, subcategory },
      },
      {
        title: "Купить материалы",
        description: "Кабель, автоматы, розетки и освещение",
        icon: "💡",
        selection: { category: "🧰 Материалы", search: "электрика кабель розетки" },
      },
      {
        title: "Электромонтаж под ключ",
        description: "Полный комплекс работ на объекте",
        icon: "🏠",
        selection: { category: categoryName, search: "под ключ" },
      },
    ];
  }

  if (normalized.includes("строительство")) {
    return [
      {
        title: "Заказать строительство",
        description: "Подрядчики и бригады",
        icon: "👷",
        selection: { category: categoryName, subcategory },
      },
      {
        title: "Найти материалы",
        description: "Материалы для выбранной работы",
        icon: "🧱",
        selection: { category: "🧰 Материалы", search: subject },
      },
      {
        title: "Заказать технику",
        description: "Экскаваторы, краны и другая спецтехника",
        icon: "🚜",
        selection: { category: "🚜 Спецтехника", search: subject },
      },
      {
        title: "Рассчитать стоимость",
        description: "Найти исполнителя для оценки и сметы",
        icon: "📋",
        selection: { category: categoryName, search: `${subject} стоимость` },
      },
    ];
  }

  return [
    {
      title: "Найти исполнителя",
      description: `Мастера и компании: ${subject.toLowerCase()}`,
      icon: "👷",
      selection: { category: categoryName, subcategory },
    },
    {
      title: "Заказать работу под ключ",
      description: "Полный комплекс работ одним исполнителем",
      icon: "🏠",
      selection: { category: categoryName, search: "под ключ" },
    },
    {
      title: "Показать все объявления",
      description: "Все предложения в выбранной категории",
      icon: "📋",
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
              {sections.map(({ id, title, description, Icon }) => (
                <button key={id} type="button" onClick={() => setSectionId(id)} className="group relative min-h-[210px] overflow-hidden rounded-[30px] border border-slate-100 bg-[#f8fbff] p-5 text-left transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:bg-white hover:shadow-[0_24px_65px_rgba(0,87,255,0.15)]">
                  <div className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(0,87,255,0.16),transparent_66%)] transition duration-500 group-hover:scale-125" />
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#0057ff] shadow-sm transition duration-300 group-hover:bg-[#0057ff] group-hover:text-white">
                    <Icon size={28} strokeWidth={2.7} />
                  </div>
                  <h3 className="relative mt-7 text-2xl font-black tracking-tight text-slate-950">{title}</h3>
                  <p className="relative mt-3 text-sm font-bold leading-6 text-slate-500">{description}</p>
                  <div className="absolute bottom-5 right-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#0057ff] shadow-sm transition duration-300 group-hover:bg-[#0057ff] group-hover:text-white">
                    <ArrowRight size={19} strokeWidth={2.8} />
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {sectionId && !activeCategory ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sectionCategories.map((category, index) => {
                const title = getTitle(category);
                const Icon = getIcon(title);
                const active = selectedCategory === title;
                return (
                  <button key={`${title}-${index}`} type="button" onClick={() => setCategoryName(title)} className={["group relative min-h-[154px] overflow-hidden rounded-[28px] border p-5 text-left transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_55px_rgba(0,87,255,0.14)]", active ? "border-[#0057ff] bg-[#0057ff] text-white" : "border-slate-100 bg-[#f8fbff] text-slate-950 hover:border-blue-200 hover:bg-white"].join(" ")}>
                    <div className="flex items-start justify-between gap-4">
                      <div className={["flex h-12 w-12 items-center justify-center rounded-2xl transition duration-300", active ? "bg-white text-[#0057ff]" : "bg-white text-[#0057ff] group-hover:bg-[#0057ff] group-hover:text-white"].join(" ")}>
                        <Icon size={24} strokeWidth={2.7} />
                      </div>
                      <span className={["rounded-full px-3 py-1 text-[11px] font-black", active ? "bg-white/15 text-white" : "bg-white text-slate-500"].join(" ")}>{getCount(category)} вариантов</span>
                    </div>
                    <h3 className={["mt-5 text-xl font-black leading-tight", active ? "text-white" : "text-slate-950"].join(" ")}>{cleanTitle(title)}</h3>
                    <ChevronRight size={20} strokeWidth={2.8} className={["absolute bottom-5 right-5 transition duration-300 group-hover:translate-x-1", active ? "text-white" : "text-[#0057ff]"].join(" ")} />
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
                  <button key={item} type="button" onClick={() => setSubcategory(item)} className={["group flex min-h-16 items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-900/5", selectedSubcategory === item ? "border-[#0057ff] bg-[#0057ff] text-white" : "border-slate-200 bg-white text-slate-800"].join(" ")}>
                    <span className="font-black leading-5">{item}</span>
                    <ChevronRight size={18} strokeWidth={2.8} className={selectedSubcategory === item ? "text-white" : "text-[#0057ff]"} />
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
                <button key={`${action.title}-${index}`} type="button" onClick={() => apply(action.selection)} className="group flex min-h-[126px] items-center gap-4 rounded-[28px] border border-slate-100 bg-[#f8fbff] p-5 text-left transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:bg-white hover:shadow-[0_22px_55px_rgba(0,87,255,0.14)]">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm transition duration-300 group-hover:scale-105">{action.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-black text-slate-950">{action.title}</span>
                    <span className="mt-1 block text-sm font-bold leading-5 text-slate-500">{action.description}</span>
                  </span>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[#0057ff] transition duration-300 group-hover:bg-[#0057ff] group-hover:text-white">
                    <ArrowRight size={18} strokeWidth={2.8} />
                  </span>
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
