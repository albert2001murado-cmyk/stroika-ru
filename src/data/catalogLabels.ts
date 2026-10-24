import { canonicalCatalogFields, currentCatalogSubcategory, type CatalogFields } from "./catalogUpdates";

/** Display a current direction; the catalog itself contains no retired options. */
export function catalogLabel(value: unknown, context: CatalogFields = {}): string {
  const label = typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ")
    .replace(/\bosb\b/giu, "ОСБ")
    .replace(/(^|[^\p{L}\p{N}])3\s*[дd](?=$|[^\p{L}\p{N}])/giu, "$13D") : "";
  return currentCatalogSubcategory(label, context);
}

export function catalogCategoryLabel(context: CatalogFields): string { return canonicalCatalogFields(context).category; }
