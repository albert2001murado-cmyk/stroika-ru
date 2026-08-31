import { categories } from "./categories";
import { groupsForSection } from "./catalogGroups";

export type CatalogSectionId =
  | "materials"
  | "services"
  | "equipment"
  | "solutions";

export type CatalogPathValue = {
  catalogSection: CatalogSectionId;
  catalogCategoryId: string;
  catalogCategoryTitle: string;
  catalogGroupId: string;
  category: string;
  subcategory: string;
};

export type CatalogFormCategory = {
  id: string;
  title: string;
  description: string;
  category: string;
  groupId: string;
  subcategories: string[];
};

export const CATALOG_FORM_SECTIONS: Array<{
  id: CatalogSectionId;
  title: string;
  description: string;
}> = [
  {
    id: "materials",
    title: "Материалы",
    description: "Продажа, поставка и производство",
  },
  {
    id: "services",
    title: "Услуги",
    description: "Мастера и бригады для отдельных работ",
  },
  {
    id: "equipment",
    title: "Техника",
    description: "Аренда, оператор и доставка на объект",
  },
  {
    id: "solutions",
    title: "Комплексные решения",
    description: "Проектирование, ремонт и строительство",
  },
];

const SOLUTION_CATEGORY_TITLES = new Set([
  "Дизайн и проектирование",
  "Ремонт квартир",
  "Строительство",
]);

function compareRu(left: string, right: string) {
  return left.localeCompare(right, "ru", {
    numeric: true,
    sensitivity: "base",
  });
}

export function cleanCatalogCategoryTitle(value: string) {
  return value.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

function sectionForCategory(categoryName: string): CatalogSectionId {
  const title = cleanCatalogCategoryTitle(categoryName);

  if (title === "Материалы") return "materials";
  if (title === "Спецтехника") return "equipment";
  if (SOLUTION_CATEGORY_TITLES.has(title)) return "solutions";
  return "services";
}

export function getCatalogSectionTitle(sectionId: CatalogSectionId) {
  return (
    CATALOG_FORM_SECTIONS.find((section) => section.id === sectionId)?.title ||
    "Каталог"
  );
}

export function getCatalogFormCategories(
  sectionId: CatalogSectionId
): CatalogFormCategory[] {
  const sourceCategories = categories
    .filter((category) => sectionForCategory(category.name) === sectionId)
    .sort((left, right) =>
      compareRu(
        cleanCatalogCategoryTitle(left.name),
        cleanCatalogCategoryTitle(right.name)
      )
    );
  const groupSection = sectionId === "equipment" ? "machinery" : sectionId;
  const groups = [...groupsForSection(groupSection)].sort((left, right) =>
    compareRu(left.title, right.title)
  );

  if (groups.length > 0 && sourceCategories[0]) {
    const sourceCategory = sourceCategories[0];

    return groups.map((group) => ({
      id: group.id,
      title: group.title,
      description: group.description,
      category: sourceCategory.name,
      groupId: group.id,
      subcategories: [...group.items].sort(compareRu),
    }));
  }

  return sourceCategories.map((category) => ({
    id: cleanCatalogCategoryTitle(category.name)
      .toLocaleLowerCase("ru-RU")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/(^-|-$)/g, ""),
    title: cleanCatalogCategoryTitle(category.name),
    description: `${category.subcategories.length} направлений`,
    category: category.name,
    groupId: "",
    subcategories: [...category.subcategories].sort(compareRu),
  }));
}

export function getDefaultCatalogPath(
  sectionId: CatalogSectionId = "services"
): CatalogPathValue {
  const firstCategory = getCatalogFormCategories(sectionId)[0];

  return {
    catalogSection: sectionId,
    catalogCategoryId: firstCategory?.id || "",
    catalogCategoryTitle: firstCategory?.title || "",
    catalogGroupId: firstCategory?.groupId || "",
    category: firstCategory?.category || "",
    subcategory: firstCategory?.subcategories[0] || "",
  };
}

export function resolveCatalogPath(input: {
  catalogSection?: string;
  catalogGroupId?: string;
  category?: string;
  subcategory?: string;
}): CatalogPathValue {
  const inferredSection = input.category
    ? sectionForCategory(input.category)
    : "services";
  const section = CATALOG_FORM_SECTIONS.some(
    (item) => item.id === input.catalogSection
  )
    ? (input.catalogSection as CatalogSectionId)
    : inferredSection;
  const options = getCatalogFormCategories(section);
  const option =
    options.find((item) => item.groupId === input.catalogGroupId) ||
    options.find((item) =>
      item.subcategories.includes(String(input.subcategory || ""))
    ) ||
    options.find((item) => item.category === input.category) ||
    options[0];

  return {
    catalogSection: section,
    catalogCategoryId: option?.id || "",
    catalogCategoryTitle: option?.title || "",
    catalogGroupId: option?.groupId || "",
    category: option?.category || input.category || "",
    subcategory:
      option?.subcategories.includes(String(input.subcategory || ""))
        ? String(input.subcategory)
        : option?.subcategories[0] || "",
  };
}
