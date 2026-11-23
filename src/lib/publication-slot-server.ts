import { createHash } from "node:crypto";
import type { DocumentData, Transaction } from "@/lib/database/admin-values";
import { getAdminDb } from "./firebase-admin";
import { AccountApiError } from "./account-api-server";
import { isPublicationExpired } from "./publication-lifetime";
import { canonicalCatalogFields, catalogTextKey } from "../data/catalogUpdates";
import { getCatalogFormCategories, type CatalogSectionId } from "../data/catalogForm";
import { FREE_CATALOGS } from "./free-placement";

export const publicationHash = (value: string) => createHash("sha256").update(value).digest("hex");

export type OwnedPublication = { id: string; kind: "listing" | "request"; data: DocumentData };
/** Query only this owner's publications. Customer and performer allowances are separate. */
export async function ownPublications(tx: Transaction, uid: string): Promise<OwnedPublication[]> {
  const db = getAdminDb();
  const fields = ["title", "description", "city", "category", "subcategory", "catalogSection", "catalogCategoryId", "catalogGroupId", "createdAt", "expiresAt", "publishedAt", "publicationTermDays", "moderationStatus", "status", "deleted", "isDeleted", "hidden", "isHidden", "archived", "isActive"];
  const [listings, requests] = await Promise.all([
    tx.get(db.collection("listings").where("authorId", "==", uid).select(...fields)),
    tx.get(db.collection("customerRequests").where("customerId", "==", uid).select(...fields)),
  ]);
  return [...listings.docs.map(d => ({ id: d.id, kind: "listing" as const, data: d.data() })), ...requests.docs.map(d => ({ id: d.id, kind: "request" as const, data: d.data() }))];
}
export function publicationActive(data: DocumentData, now = Date.now()) {
  return !data.deleted && !data.isDeleted && !data.hidden && !data.isHidden && !data.archived && data.isActive !== false &&
    !["closed", "archived", "deleted", "canceled", "completed", "inactive"].includes(String(data.status || "")) &&
    !["rejected", "blocked", "deleted", "payment_required"].includes(String(data.moderationStatus || "")) &&
    !isPublicationExpired(data, now);
}
export function publicationCatalogPath(input: DocumentData) {
  const canonical = canonicalCatalogFields(input);
  const subcategory = canonical.subcategory;
  const category = catalogTextKey(canonical.category);
  const matches = FREE_CATALOGS.flatMap(catalog => getCatalogFormCategories(catalog as CatalogSectionId).flatMap(option =>
    option.subcategories.some(s => catalogTextKey(s) === catalogTextKey(subcategory)) &&
    (!category || catalogTextKey(option.category) === category || catalogTextKey(option.title) === category)
      ? [{ catalog, option }] : []));
  const selected = matches.find(m => m.catalog === canonical.catalogSection && (m.option.id === canonical.catalogCategoryId || m.option.groupId === canonical.catalogGroupId)) || matches[0];
  if (!selected || !subcategory) throw new AccountApiError("Выберите действующие каталог, категорию и подкатегорию", 400, "invalid-catalog");
  if (canonical.catalogSection && canonical.catalogSection !== selected.catalog) throw new AccountApiError("Каталог не соответствует выбранному направлению", 400, "invalid-catalog");
  return { catalogSection: selected.catalog, catalogCategoryId: selected.option.id, catalogCategoryTitle: selected.option.title, catalogGroupId: selected.option.groupId || null, catalogGroupTitle: selected.option.groupId ? selected.option.title : "", category: selected.option.category,
    subcategory: selected.option.subcategories.find(s => catalogTextKey(s) === catalogTextKey(subcategory))!,
    catalogPath: [({ materials: "Материалы", services: "Услуги", equipment: "Техника", solutions: "Комплексные решения" } as const)[selected.catalog], selected.option.title, subcategory] };
}
export function assertPublicationSlot(owned: OwnedPublication[], next: DocumentData, kind: "listing" | "request", limit: number, exceptId = "", now = Date.now()) {
  const catalog = publicationCatalogPath(next).catalogSection;
  const active = owned.filter(item => item.kind === kind && item.id !== exceptId && publicationActive(item.data, now));
  const inCatalog = active.filter(item => {
    try { return publicationCatalogPath(item.data).catalogSection === catalog; } catch { return item.data.catalogSection === catalog; }
  });
  if (inCatalog.length >= limit) throw new AccountApiError(`Достигнут лимит ${limit} активных объявлений в этом каталоге`, 409, "active-limit");
  for (const item of inCatalog) {
    const old = canonicalCatalogFields(item.data);
    if (kind === "listing" && catalog === "equipment" && catalogTextKey(old.subcategory) === catalogTextKey(next.subcategory)) throw new AccountApiError("В этой подкатегории техники уже есть активное объявление. Несколько машин одного типа укажите в одной анкете", 409, "equipment-duplicate");
    if (item.kind !== kind) continue;
    const identical = catalogTextKey(item.data.title) === catalogTextKey(next.title) && catalogTextKey(item.data.description) === catalogTextKey(next.description);
    if (identical && ((kind === "listing" && catalog === "materials") || (catalogTextKey(old.subcategory) === catalogTextKey(next.subcategory) && catalogTextKey(item.data.city) === catalogTextKey(next.city))))
      throw new AccountApiError("Такое объявление уже активно. Одинаковые объявления размещать нельзя", 409, "duplicate-publication");
  }
}
