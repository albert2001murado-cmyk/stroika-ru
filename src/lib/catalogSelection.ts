import { canonicalCatalogFields, currentCatalogSubcategory, catalogSubcategoryMatches } from "../data/catalogUpdates";
import { getCatalogFormCategories, type CatalogSectionId } from "@/data/catalogForm";

const sections: CatalogSectionId[] = ["materials", "services", "equipment", "solutions"];
export function normalizeCatalogText(value: unknown) {
  return String(value || "").toLocaleLowerCase("ru-RU").replace(/\bosb\b/g, "осб").replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
export function publicationCatalogSelection(data: {
  catalogSection?: string; catalogCategoryId?: string; catalogGroupId?: string | null;
  category?: string; subcategory?: string;
}) {
  data = canonicalCatalogFields(data);
  const category = normalizeCatalogText(data.category);
  const inferred = category === "материалы" ? "materials" : category === "спецтехника" ? "equipment"
    : ["ремонт квартир", "дизайн и проектирование", "строительство"].includes(category) ? "solutions" : "services";
  const section = sections.includes(data.catalogSection as CatalogSectionId)
    ? data.catalogSection as CatalogSectionId : inferred;
  const options = getCatalogFormCategories(section);
  const option = (data.catalogGroupId ? options.find((item) => item.groupId === data.catalogGroupId) : undefined)
    || options.find((item) => item.id === data.catalogCategoryId && (!data.subcategory || item.subcategories.some((value) => normalizeCatalogText(value) === normalizeCatalogText(data.subcategory))))
    || options.find((item) => item.subcategories.some((value) => normalizeCatalogText(value) === normalizeCatalogText(data.subcategory)))
    || options.find((item) => normalizeCatalogText(item.category) === category || normalizeCatalogText(item.title) === category);
  return { section, categoryId: option?.id || "", category: data.category || option?.category || "", subcategory: currentCatalogSubcategory(data.subcategory, data) };
}

/** Canonical exact matching: a merged direction is one filter, never duplicate rows. */
export function publicationMatchesCatalogPath(data: Parameters<typeof publicationCatalogSelection>[0], filter: { category?: string; subcategory?: string; catalogSection?: string; catalogCategoryId?: string }) {
  const selected = canonicalCatalogFields(filter);
  const publication = publicationCatalogSelection(data);
  return (!selected.catalogSection || publication.section === selected.catalogSection) &&
    (!selected.catalogCategoryId || publication.categoryId === selected.catalogCategoryId) &&
    (!selected.category || Boolean(selected.catalogCategoryId) || normalizeCatalogText(publication.category) === normalizeCatalogText(selected.category)) &&
    (!selected.subcategory || catalogSubcategoryMatches(publication.subcategory, selected.subcategory, selected));
}
