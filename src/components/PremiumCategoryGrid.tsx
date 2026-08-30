"use client";

import { getMaterialServiceLink } from "@/data/materialServices";
import { groupsForSection } from "@/data/catalogGroups";
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
  offerAction?: string;
  offerFeatures?: string[];
  sourceMaterial?: string;
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
    image: "/categories/sections/materials-overview.png",
    keys: ["материал"],
  },
  {
    id: "services",
    title: "Услуги",
    description: "Мастера и бригады для отдельных строительных работ",
    image: "/categories/services/services-overview.png",
    keys: ["отдел", "элект", "сант", "пол", "крыша", "фасад", "участок", "благоустрой", "инженер", "окна", "двер", "мебель", "дополнитель"],
  },
  {
    id: "machinery",
    title: "Техника",
    description: "Спецтехника, доставка и работа с оператором",
    image: "/categories/sections/equipment-overview.png",
    keys: ["спецтехника"],
  },
  {
    id: "complex",
    title: "Комплексные решения",
    description: "Проектирование, ремонт и строительство под ключ",
    image: "/categories/sections/solutions-overview.png",
    keys: ["ремонт квартир", "дизайн", "проектирование", "строительство"],
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
  materials: "/categories/sections/materials-overview.png",
  repair: "/categories/solutions/solutions-repair.png",
  services: "/categories/services/services-overview.png",
  finishing: "/categories/services/services-finishing.png",
  electric: "/categories/services/services-electric.png",
  plumbing: "/categories/services/services-plumbing.png",
  floors: "/categories/services/services-floors.png",
  roof: "/categories/services/services-roof.png",
  landscape: "/categories/services/services-landscape.png",
  construction: "/categories/solutions/solutions-construction.png",
  equipment: "/categories/sections/equipment-overview.png",
  design: "/categories/solutions/solutions-design.png",
  engineering: "/categories/services/services-engineering.png",
  windows: "/categories/services/services-windows.png",
  furniture: "/categories/services/services-furniture.png",
  extra: "/categories/services/services-extra.png",
  all: "/categories/all.png",
} as const;

function getCategoryImage(title: string) {
  const value = normalize(title);

  if (value.includes("материал")) return CATEGORY_IMAGES.materials;
  if (value.includes("ремонт квартир")) return CATEGORY_IMAGES.repair;
  if (value.includes("дизайн") || value.includes("проект")) return CATEGORY_IMAGES.design;
  if (value.includes("пол")) return CATEGORY_IMAGES.floors;
  if (value.includes("отдел")) return CATEGORY_IMAGES.finishing;
  if (value.includes("элект")) return CATEGORY_IMAGES.electric;
  if (value.includes("сант")) return CATEGORY_IMAGES.plumbing;
  if (value.includes("спец") || value.includes("техника")) return CATEGORY_IMAGES.equipment;
  if (value.includes("участок") || value.includes("благоустрой")) return CATEGORY_IMAGES.landscape;
  if (value.includes("инженер")) return CATEGORY_IMAGES.engineering;
  if (value.includes("окна") || value.includes("двер")) return CATEGORY_IMAGES.windows;
  if (value.includes("мебель")) return CATEGORY_IMAGES.furniture;
  if (value.includes("дополнитель")) return CATEGORY_IMAGES.extra;
  if (value.includes("крыша") || value.includes("фасад")) return CATEGORY_IMAGES.roof;
  if (value.includes("стро")) return CATEGORY_IMAGES.construction;

  return CATEGORY_IMAGES.repair;
}

function getCount(category: CategoryLike) {
  return typeof category.count === "number" ? category.count : category.subcategories?.length || 0;
}

function resolveCategoryName(categories: CategoryLike[], target: string) {
  const normalizedTarget = normalize(target);
  const matched = categories.find(
    (item) => normalize(cleanTitle(getTitle(item))) === normalizedTarget
  );

  return matched ? getTitle(matched) : target;
}

const SUBCATEGORY_PAGE_SIZE = 18;

function getOrderedSubcategories(category: CategoryLike) {
  return [...(category.subcategories || [])].sort((a, b) =>
    a.localeCompare(b, "ru", { numeric: true, sensitivity: "base" })
  );
}

function buildActions(
  category: CategoryLike,
  subcategory: string,
  categories: CategoryLike[]
): Array<{
  title: string;
  description: string;
  image: string;
  selection: CategorySelection;
}> {
  const categoryName = getTitle(category);
  const normalized = normalize(categoryName);
  const subject = subcategory || cleanTitle(categoryName);

  if (normalized.includes("материал")) {
    const serviceLink = getMaterialServiceLink(subcategory);
    const specialistActions = serviceLink
      ? [
          {
            title: serviceLink.actionTitle,
            description: `${serviceLink.category} · ${serviceLink.subcategory}`,
            image: getCategoryImage(serviceLink.category),
            selection: {
              category: resolveCategoryName(categories, serviceLink.category),
              subcategory: serviceLink.subcategory,
              search: "",
              sourceMaterial: subcategory,
            },
          },
        ]
      : [];

    return [
      {
        title: `Купить ${subject.toLowerCase()}`,
        description: "Продавцы и производители",
        image: CATEGORY_IMAGES.materials,
        selection: {
          category: categoryName,
          subcategory,
          offerAction: "material_sale",
        },
      },
      {
        title: "Заказать доставку",
        description: `Доставка: ${subject.toLowerCase()}`,
        image: CATEGORY_IMAGES.extra,
        selection: {
          category: categoryName,
          subcategory,
          search: `${subject} доставка`,
          offerFeatures: ["deliveryAvailable"],
        },
      },
      ...specialistActions,
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
        selection: {
          category: categoryName,
          subcategory,
          offerAction: "equipment_rent",
        },
      },
      {
        title: "Заказать с оператором",
        description: "Работа на объекте с опытным специалистом",
        image: CATEGORY_IMAGES.repair,
        selection: {
          category: categoryName,
          subcategory,
          search: `${subject} оператор`,
          offerFeatures: ["operatorIncluded"],
        },
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
        selection: {
          category: categoryName,
          search: "под ключ",
          offerAction: "service_turnkey",
        },
      },
    ];
  }

  if (normalized.includes("дизайн") || normalized.includes("проектирование")) {
    return [
      {
        title: "Найти подрядчика",
        description: `${subject} — исполнители и компании`,
        image: CATEGORY_IMAGES.design,
        selection: { category: categoryName, subcategory },
      },
      {
        title: "Рассчитать стоимость",
        description: "Получить оценку и расчёт проекта",
        image: CATEGORY_IMAGES.design,
        selection: {
          category: categoryName,
          subcategory,
          search: `${subject} стоимость`,
          offerAction: "complex_project",
        },
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
        selection: {
          category: categoryName,
          search: `${subject} стоимость`,
          offerAction: "complex_project",
        },
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
      selection: {
        category: categoryName,
        search: "под ключ",
        offerAction: "service_turnkey",
      },
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
  const [groupId, setGroupId] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [search, setSearch] = useState("");
  const [sectionSearch, setSectionSearch] = useState("");
  const [subcategoryPage, setSubcategoryPage] = useState(1);

  const section = sections.find((item) => item.id === sectionId) || null;
  const catalogGroups = groupsForSection(sectionId);
  const activeGroup = catalogGroups.find((item) => item.id === groupId) || null;
  const activeCategory = categories.find((item) => getTitle(item) === categoryName);

  const sectionCategories = useMemo(() => {
    if (!section) return [];
    return categories
      .filter((item) => {
        const title = normalize(getTitle(item));
        return section.keys.some((key) => title.includes(normalize(key)));
      })
      .sort((a, b) =>
        cleanTitle(getTitle(a)).localeCompare(cleanTitle(getTitle(b)), "ru", {
          numeric: true,
          sensitivity: "base",
        })
      );
  }, [categories, section]);

  const sectionSearchResults = useMemo(() => {
    if (!section) return [];
    const query = normalize(sectionSearch);
    if (!query) return [];

    return sectionCategories
      .flatMap((category) =>
        getOrderedSubcategories(category).map((item) => {
          const group = catalogGroups.find((candidate) =>
            candidate.items.some((groupItem) => normalize(groupItem) === normalize(item))
          );
          const categoryTitle = cleanTitle(getTitle(category));
          const path = group
            ? [section.title, group.title, item]
            : [section.title, categoryTitle, item];

          return {
            category,
            subcategory: item,
            path,
          };
        })
      )
      .filter(({ path }) => normalize(path.join(" ")).includes(query))
      .sort((left, right) => {
        const leftValue = normalize(left.subcategory);
        const rightValue = normalize(right.subcategory);
        const leftPriority = leftValue === query ? 0 : leftValue.startsWith(query) ? 1 : 2;
        const rightPriority = rightValue === query ? 0 : rightValue.startsWith(query) ? 1 : 2;
        if (leftPriority !== rightPriority) return leftPriority - rightPriority;
        return left.subcategory.localeCompare(right.subcategory, "ru", {
          numeric: true,
          sensitivity: "base",
        });
      })
      .slice(0, 24);
  }, [catalogGroups, section, sectionCategories, sectionSearch]);

  const filteredSubcategories = useMemo(() => {
    if (!activeCategory) return [];
    const all = activeGroup
      ? [...activeGroup.items].sort((a, b) =>
          a.localeCompare(b, "ru", { numeric: true, sensitivity: "base" })
        )
      : getOrderedSubcategories(activeCategory);
    const value = normalize(search);
    if (!value) return all;
    return all.filter((item) => normalize(item).includes(value));
  }, [activeCategory, activeGroup, search]);

  const subcategoryPageCount = Math.max(
    1,
    Math.ceil(filteredSubcategories.length / SUBCATEGORY_PAGE_SIZE)
  );
  const safeSubcategoryPage = Math.min(
    Math.max(subcategoryPage, 1),
    subcategoryPageCount
  );
  const visibleSubcategories = filteredSubcategories.slice(
    (safeSubcategoryPage - 1) * SUBCATEGORY_PAGE_SIZE,
    safeSubcategoryPage * SUBCATEGORY_PAGE_SIZE
  );
  const subcategoryPageNumbers = Array.from(
    { length: subcategoryPageCount },
    (_, index) => index + 1
  ).filter(
    (pageNumber) =>
      pageNumber === 1 ||
      pageNumber === subcategoryPageCount ||
      Math.abs(pageNumber - safeSubcategoryPage) <= 1
  );

  const actions = activeCategory
    ? buildActions(activeCategory, subcategory, categories)
    : [];

  function resetAll() {
    setSectionId(null);
    setCategoryName("");
    setGroupId("");
    setSubcategory("");
    setSearch("");
    setSectionSearch("");
    setSubcategoryPage(1);
    onSelectCategory?.("");
    onApplySelection?.({ category: "", subcategory: "", search: "" });
  }

  function goBack() {
    if (subcategory) return setSubcategory("");
    if (categoryName) {
      setCategoryName("");
      setGroupId("");
      setSearch("");
      setSubcategoryPage(1);
      return;
    }
    setSectionId(null);
    setSectionSearch("");
    setSubcategoryPage(1);
  }

  function changeSubcategoryPage(nextPage: number) {
    const targetPage = Math.min(
      Math.max(nextPage, 1),
      subcategoryPageCount
    );
    setSubcategoryPage(targetPage);
  }

  function apply(selection: CategorySelection) {
    onSelectCategory?.(selection.category);
    onApplySelection?.(selection);
    window.requestAnimationFrame(() => {
      document.getElementById("recommended-listings")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function chooseSubcategory(value: string) {
    if (activeCategory && normalize(getTitle(activeCategory)).includes("мебель")) {
      apply({
        category: getTitle(activeCategory),
        subcategory: value,
        search: "",
      });
      return;
    }

    setSubcategory(value);
  }

  const heading = subcategory
    ? subcategory
    : activeGroup
      ? activeGroup.title
    : activeCategory
      ? cleanTitle(getTitle(activeCategory))
      : section
        ? section.title
        : "Что вам нужно?";

  const subtitle = subcategory
    ? "Выберите подходящее действие"
    : activeGroup
      ? activeGroup.description
    : activeCategory
      ? "Выберите конкретную услугу или товар"
      : section
        ? "Выберите направление внутри раздела"
        : "Сначала выберите один из четырёх понятных разделов";

  return (
    <section className={`relative ${className}`}>
      <div className="pointer-events-none absolute inset-x-0 -top-10 h-44 rounded-[48px] bg-[radial-gradient(circle_at_15%_15%,rgba(0,87,255,0.15),transparent_36%),radial-gradient(circle_at_85%_0%,rgba(56,189,248,0.13),transparent_34%)] blur-2xl" />

      <div className="relative overflow-hidden rounded-[26px] border border-blue-100 bg-white p-4 shadow-[0_24px_75px_rgba(15,23,42,0.08)] sm:rounded-[36px] sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#0057ff]">
              <ShieldCheck size={15} strokeWidth={2.7} />
              Удобный каталог
            </div>
            <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950 sm:text-4xl">{heading}</h2>
            <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-slate-500 sm:text-base">{subtitle}</p>
          </div>

          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            {sectionId ? (
              <button type="button" onClick={goBack} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 sm:w-auto text-sm font-black text-slate-700 transition duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:text-[#0057ff]">
                <ArrowLeft size={17} strokeWidth={2.8} />
                Назад
              </button>
            ) : null}

            <button type="button" onClick={resetAll} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#0057ff] px-5 sm:w-auto text-sm font-black text-white shadow-xl shadow-blue-600/20 transition duration-300 hover:-translate-y-0.5 hover:bg-[#0047d6]">
              Все объявления
              <ArrowRight size={16} strokeWidth={2.8} />
            </button>
          </div>
        </div>

        <div key={`${sectionId}-${groupId}-${categoryName}-${subcategory}`} className="category-stage relative mt-7">
          {!sectionId ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {sections.map(({ id, title, description, image }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setSectionId(id);
                    setSectionSearch("");
                  }}
                  className="group relative min-h-[190px] overflow-hidden rounded-[24px] sm:min-h-[228px] sm:rounded-[30px] border border-slate-100 bg-[#f8fbff] p-5 text-left transition duration-500 ease-out hover:-translate-y-1.5 hover:border-blue-200 hover:bg-white hover:shadow-[0_26px_70px_rgba(0,87,255,0.16)] active:scale-[0.975]"
                >
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_82%,rgba(0,87,255,0.13),transparent_42%)] opacity-70 transition duration-500 group-hover:opacity-100" />

                  <div className="relative z-10 max-w-[64%] sm:max-w-[66%]">
                    <h3 className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">{title}</h3>
                    <p className="mt-3 text-sm font-bold leading-6 text-slate-500">{description}</p>
                  </div>

                  <img
                    src={image}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-4 -right-3 h-[128px] w-[128px] sm:h-[154px] sm:w-[154px] object-contain drop-shadow-[0_20px_22px_rgba(15,23,42,0.2)] transition duration-500 ease-out group-hover:-translate-x-1.5 group-hover:-translate-y-2 group-hover:rotate-[-1deg] group-hover:scale-[1.07]"
                  />
                </button>
              ))}
            </div>
          ) : null}

          {sectionId && !activeCategory ? (
            <div className="mb-5">
              <div className="relative">
                <Search size={21} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[#0057ff]" />
                <input
                  value={sectionSearch}
                  onChange={(event) => setSectionSearch(event.target.value)}
                  placeholder={`Найти в разделе «${section?.title || "Каталог"}»`}
                  className="h-16 w-full rounded-[22px] border border-blue-100 bg-blue-50/45 pl-14 pr-5 text-base font-black text-slate-950 outline-none transition placeholder:font-bold placeholder:text-slate-400 focus:border-[#0057ff] focus:bg-white focus:ring-4 focus:ring-blue-100"
                />
              </div>

              {normalize(sectionSearch) ? (
                <div className="catalog-page-stage mt-4">
                  {sectionSearchResults.length > 0 ? (
                    <>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-black text-slate-950">Подходящие позиции</p>
                        <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-[#0057ff] ring-1 ring-blue-100">
                          Найдено: {sectionSearchResults.length}
                        </span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {sectionSearchResults.map((result) => (
                          <button
                            key={`${getTitle(result.category)}-${result.subcategory}`}
                            type="button"
                            onClick={() => apply({
                              category: getTitle(result.category),
                              subcategory: result.subcategory,
                              search: "",
                            })}
                            className="group flex min-h-[88px] items-center gap-4 rounded-[22px] border border-slate-200 bg-white p-3 text-left transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-900/5 active:scale-[.985]"
                          >
                            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[18px] bg-blue-50">
                              <img src={getCategoryImage(getTitle(result.category))} alt="" aria-hidden="true" className="h-14 w-14 object-contain" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-black leading-5 text-slate-950">{result.subcategory}</span>
                              <span className="mt-1.5 block text-xs font-bold leading-5 text-slate-500">
                                {result.path.map((segment, index) => (
                                  <span key={`${segment}-${index}`}>
                                    {index > 0 ? <span className="text-[#0057ff]"> → </span> : null}
                                    {segment}
                                  </span>
                                ))}
                              </span>
                            </span>
                            <ArrowRight size={19} className="shrink-0 text-[#0057ff] transition duration-300 group-hover:translate-x-1" />
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-blue-200 bg-blue-50/50 p-7 text-center">
                      <Search size={27} className="mx-auto text-[#0057ff]" />
                      <p className="mt-3 font-black text-slate-950">Ничего не найдено</p>
                      <p className="mt-1 text-sm font-bold text-slate-500">Попробуйте ввести часть названия категории или работы.</p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {sectionId && !activeCategory && catalogGroups.length > 0 && !normalize(sectionSearch) ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {catalogGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => {
                    const sourceCategory = sectionCategories[0];
                    if (!sourceCategory) return;
                    setGroupId(group.id);
                    setCategoryName(getTitle(sourceCategory));
                    setSearch("");
                    setSubcategoryPage(1);
                  }}
                  className="group relative min-h-[190px] overflow-hidden rounded-[28px] border border-slate-100 bg-[#f8fbff] p-5 text-left transition duration-500 ease-out hover:-translate-y-1.5 hover:border-blue-200 hover:bg-white hover:shadow-[0_24px_60px_rgba(0,87,255,0.15)] active:scale-[0.98]"
                >
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_82%,rgba(0,87,255,0.14),transparent_45%)] opacity-75 transition duration-500 group-hover:opacity-100" />
                  <span className="relative z-10 inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-black text-[#0057ff] shadow-sm ring-1 ring-blue-100">
                    {group.items.length} позиций
                  </span>
                  <h3 className="relative z-10 mt-5 max-w-[64%] text-xl font-black leading-tight text-slate-950">
                    {group.title}
                  </h3>
                  <p className="relative z-10 mt-2 max-w-[66%] text-sm font-bold leading-5 text-slate-500">
                    {group.description}
                  </p>
                  <img
                    src={`/categories/groups/${group.imageKey}.png`}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-5 -right-3 h-[132px] w-[132px] object-contain drop-shadow-[0_18px_20px_rgba(15,23,42,0.2)] transition duration-500 ease-out group-hover:-translate-x-1 group-hover:-translate-y-2 group-hover:rotate-[-1deg] group-hover:scale-[1.08]"
                  />
                </button>
              ))}
            </div>
          ) : null}

          {sectionId && !activeCategory && catalogGroups.length === 0 && !normalize(sectionSearch) ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sectionCategories.map((category, index) => {
                const title = getTitle(category);
                const image = getCategoryImage(title);
                const active = selectedCategory === title;

                return (
                  <button
                    key={`${title}-${index}`}
                    type="button"
                    onClick={() => {
                      setCategoryName(title);
                      setGroupId("");
                      setSearch("");
                      setSubcategoryPage(1);
                    }}
                    className={[
                      "group relative min-h-[160px] overflow-hidden rounded-[24px] border p-4 sm:min-h-[184px] sm:rounded-[28px] sm:p-5 text-left transition duration-500 ease-out hover:-translate-y-1.5 hover:shadow-[0_24px_60px_rgba(0,87,255,0.15)] active:scale-[0.98]",
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
                      className="pointer-events-none absolute -bottom-4 -right-2 h-[108px] w-[108px] sm:h-[126px] sm:w-[126px] object-contain drop-shadow-[0_16px_18px_rgba(15,23,42,0.18)] transition duration-500 ease-out group-hover:-translate-x-1 group-hover:-translate-y-2 group-hover:rotate-[-1deg] group-hover:scale-[1.08]"
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
                  <input
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setSubcategoryPage(1);
                    }}
                    placeholder={`Найти внутри «${activeGroup?.title || cleanTitle(getTitle(activeCategory))}»`}
                    className="h-14 w-full rounded-2xl border border-slate-200 bg-[#f8fafc] pl-14 pr-5 text-sm font-bold text-slate-950 outline-none transition focus:border-[#0057ff] focus:bg-white focus:ring-4 focus:ring-blue-100"
                  />
                </div>
              ) : null}

              {filteredSubcategories.length > 0 ? (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-bold text-slate-500">
                    Найдено позиций: {filteredSubcategories.length}
                  </p>
                  {subcategoryPageCount > 1 ? (
                    <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-[#0057ff] ring-1 ring-blue-100">
                      Страница {safeSubcategoryPage} из {subcategoryPageCount}
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div
                key={`${categoryName}-${search}-${safeSubcategoryPage}`}
                className="catalog-page-stage grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
              >
                {visibleSubcategories.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => chooseSubcategory(item)}
                    className={[
                      "group flex min-h-14 items-center justify-between gap-3 rounded-2xl border px-4 py-3 sm:min-h-16 sm:px-5 text-left transition duration-300 ease-out hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-900/5 active:scale-[0.985]",
                      selectedSubcategory === item
                        ? "border-[#0057ff] bg-[#0057ff] text-white"
                        : "border-slate-200 bg-white text-slate-800",
                    ].join(" ")}
                  >
                    <span className="font-black leading-5 transition duration-300 group-hover:translate-x-1">{item}</span>
                    <ArrowRight
                      size={17}
                      className="shrink-0 text-[#0057ff] opacity-0 transition duration-300 group-hover:translate-x-1 group-hover:opacity-100"
                    />
                  </button>
                ))}
              </div>

              {subcategoryPageCount > 1 && filteredSubcategories.length > 0 ? (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2 rounded-[24px] border border-blue-100 bg-blue-50/50 p-3">
                  <button
                    type="button"
                    onClick={() => changeSubcategoryPage(safeSubcategoryPage - 1)}
                    disabled={safeSubcategoryPage === 1}
                    aria-label="Предыдущая страница каталога"
                    className="group flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#0057ff] shadow-sm ring-1 ring-blue-100 transition duration-300 hover:-translate-x-0.5 hover:shadow-lg active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-x-0"
                  >
                    <ArrowLeft size={18} className="transition duration-300 group-hover:-translate-x-0.5" />
                  </button>

                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {subcategoryPageNumbers.map((pageNumber, index) => {
                      const previous = subcategoryPageNumbers[index - 1];
                      const showGap = previous && pageNumber - previous > 1;

                      return (
                        <span key={pageNumber} className="flex items-center gap-2">
                          {showGap ? (
                            <span className="px-1 font-black text-slate-400">…</span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => changeSubcategoryPage(pageNumber)}
                            aria-current={pageNumber === safeSubcategoryPage ? "page" : undefined}
                            className={[
                              "flex h-11 min-w-11 items-center justify-center rounded-2xl px-3 text-sm font-black transition duration-300 active:scale-95",
                              pageNumber === safeSubcategoryPage
                                ? "bg-[#0057ff] text-white shadow-lg shadow-blue-600/20"
                                : "bg-white text-slate-600 ring-1 ring-blue-100 hover:-translate-y-0.5 hover:text-[#0057ff] hover:shadow-lg",
                            ].join(" ")}
                          >
                            {pageNumber}
                          </button>
                        </span>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => changeSubcategoryPage(safeSubcategoryPage + 1)}
                    disabled={safeSubcategoryPage === subcategoryPageCount}
                    aria-label="Следующая страница каталога"
                    className="group flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#0057ff] shadow-sm ring-1 ring-blue-100 transition duration-300 hover:translate-x-0.5 hover:shadow-lg active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-x-0"
                  >
                    <ArrowRight size={18} className="transition duration-300 group-hover:translate-x-0.5" />
                  </button>
                </div>
              ) : null}

              {filteredSubcategories.length === 0 ? (
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
                  className="group relative min-h-[132px] overflow-hidden rounded-[24px] sm:min-h-[142px] sm:rounded-[28px] border border-slate-100 bg-[#f8fbff] p-5 text-left transition duration-500 ease-out hover:-translate-y-1.5 hover:border-blue-200 hover:bg-white hover:shadow-[0_24px_60px_rgba(0,87,255,0.15)] active:scale-[0.98]"
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
        .catalog-page-stage { animation: categoryStageIn 240ms ease-out both; }
      `}</style>
    </section>
  );
}
