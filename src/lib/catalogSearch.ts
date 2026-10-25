import { CATALOG_FORM_SECTIONS, getCatalogFormCategories, type CatalogSectionId } from "../data/catalogForm";
import { catalogSearchRelevanceScore } from "./searchKeywords";

export type CatalogSearchSuggestion = {
  id: string; title: string; path: string[]; section: CatalogSectionId;
  categoryId: string; category: string; subcategory: string;
};

export function normalizeSearchText(value: unknown) {
  return String(value || "").toLocaleLowerCase("ru-RU").replace(/\bosb\b/g, "осб")
    .replaceAll("ё", "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

type IndexedCatalogSearchSuggestion = CatalogSearchSuggestion & {
  normalizedTitle: string;
  searchable: string;
};

const entries: IndexedCatalogSearchSuggestion[] = CATALOG_FORM_SECTIONS.flatMap(section =>
  getCatalogFormCategories(section.id).flatMap(category => category.subcategories.map(subcategory => ({
    id: `${section.id}:${category.id}:${subcategory}`, title: subcategory,
    path: [section.title, category.title, subcategory], section: section.id,
    categoryId: category.id, category: category.category, subcategory,
    normalizedTitle: normalizeSearchText(subcategory),
    searchable: normalizeSearchText([section.title, category.title, subcategory].join(" ")),
  })))
);

export function getCatalogSearchSuggestions(
  value: string,
  section?: CatalogSectionId | "",
  categoryId?: string,
  limit = 4
): CatalogSearchSuggestion[] {
  const query = normalizeSearchText(value);
  if (!query) return [];
  const seen = new Set<string>();
  return entries
    .filter(item => {
      if (section && item.section !== section) return false;
      if (categoryId && item.categoryId !== categoryId) return false;
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .map(item => ({
      item,
      relevance: catalogSearchRelevanceScore(item.title, item.searchable, query, section),
    }))
    .filter(({ relevance }) => relevance >= 0)
    .sort((left, right) => {
      const titleRank = (title: string) =>
        title === query ? 0 : title.startsWith(query) ? 1 : 2;
      return (
        titleRank(left.item.normalizedTitle) - titleRank(right.item.normalizedTitle) ||
        right.relevance - left.relevance ||
        left.item.title.localeCompare(right.item.title, "ru", {
          numeric: true,
          sensitivity: "base",
        })
      );
    })
    .slice(0, limit)
    .map(({ item }) => item);
}
