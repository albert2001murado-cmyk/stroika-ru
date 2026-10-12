import {
  CATALOG_FORM_SECTIONS,
  getCatalogFormCategories,
  type CatalogFormCategory,
  type CatalogSectionId,
} from "@/data/catalogForm";

type CatalogConsistencyIssue = {
  code: string;
  message: string;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, maximum = 180) {
  return typeof value === "string"
    ? value.normalize("NFKC").trim().slice(0, maximum)
    : "";
}

function normalize(value: unknown) {
  return text(value)
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function same(left: unknown, right: unknown) {
  const leftValue = normalize(left);
  return Boolean(leftValue) && leftValue === normalize(right);
}

function findSelectedOption(
  section: CatalogSectionId,
  data: Record<string, unknown>
): CatalogFormCategory | undefined {
  const options = getCatalogFormCategories(section);
  const categoryId = text(data.catalogCategoryId, 80);
  const groupId = text(data.catalogGroupId, 80);
  const category = text(data.category);
  const subcategory = text(data.subcategory);

  return (
    (groupId && options.find((option) => option.groupId === groupId)) ||
    (categoryId && options.find((option) => option.id === categoryId)) ||
    options.find((option) =>
      option.subcategories.some((value) => same(value, subcategory))
    ) ||
    options.find(
      (option) => same(option.category, category) || same(option.title, category)
    )
  );
}

/**
 * Rejects forged or stale catalog combinations before semantic moderation.
 * The publication must point to one of the paths that is currently visible in
 * the common site/app catalog.
 */
export function checkCatalogConsistency(
  value: unknown
): CatalogConsistencyIssue | null {
  const data = object(value);
  const section = text(data.catalogSection, 32);
  const category = text(data.category);
  const subcategory = text(data.subcategory);

  if (!section && !category && !subcategory) return null;

  const sectionDefinition = CATALOG_FORM_SECTIONS.find(
    (item) => item.id === section
  );
  if (!sectionDefinition) {
    return {
      code: "catalog-section-not-found",
      message:
        "Выбранный раздел больше не существует. Откройте каталог и выберите раздел заново.",
    };
  }

  const option = findSelectedOption(sectionDefinition.id, data);
  if (!option) {
    return {
      code: "catalog-category-not-found",
      message:
        "Выбранная категория отсутствует в каталоге. Выберите доступную категорию заново.",
    };
  }

  if (
    category &&
    !same(category, option.category) &&
    !same(category, option.title)
  ) {
    return {
      code: "catalog-category-conflict",
      message:
        "Категория и раздел объявления не совпадают. Выберите категорию заново, не изменяя её вручную.",
    };
  }

  const canonicalSubcategory = option.subcategories.find((item) =>
    same(item, subcategory)
  );
  if (!canonicalSubcategory) {
    return {
      code: "catalog-subcategory-not-found",
      message: `Подкатегория «${subcategory || "не указана"}» отсутствует в выбранной категории «${option.title}». Выберите один из доступных вариантов.`,
    };
  }

  return null;
}

