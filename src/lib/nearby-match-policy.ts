import { normalizePublicationCatalog } from "./publication-policy";
import { CATALOG_FORM_SECTIONS, getCatalogFormCategories } from "../data/catalogForm";

const knownCategoryIds = new Set(CATALOG_FORM_SECTIONS.flatMap(section =>
  getCatalogFormCategories(section.id).map(category => category.id)));

export const NEARBY_MATCH_RADIUS_KM = 10;
export type MatchPoint = { lat: number; lng: number };
export type MatchPublication = Record<string, unknown>;

export function validMatchPoint(value: MatchPoint): boolean {
  return typeof value.lat === "number" && typeof value.lng === "number" &&
    Number.isFinite(value.lat) && Number.isFinite(value.lng) &&
    Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180;
}

export function distanceKm(a: MatchPoint, b: MatchPoint): number {
  if (!validMatchPoint(a) || !validMatchPoint(b)) return Infinity;
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) *
    Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}

export function eligiblePublication(data: MatchPublication, kind: "request" | "listing") {
  // Legacy published listings may predate moderation. Pending/rejected/private
  // publications must never be advertised to another user.
  if (data.moderationStatus && data.moderationStatus !== "approved") return false;
  if (data.deleted === true || data.isDeleted === true || data.hidden === true ||
      data.isHidden === true || data.archived === true || data.isActive === false) return false;
  if (kind === "request") return data.status === "active";
  return !data.status || data.status === "active" || data.status === "published";
}

export function sameCatalogPath(a: MatchPublication, b: MatchPublication) {
  const left = normalizePublicationCatalog(a);
  const right = normalizePublicationCatalog(b);
  // Moderation's legacy normalizer can recover a category from a subcategory.
  // Matching must not reinterpret a conflicting explicit category as a match.
  for (const [data, catalog] of [[a, left], [b, right]] as const) {
    if (data.catalogSection && data.catalogSection !== catalog.section) return false;
    if (typeof data.catalogCategoryId === "string" && knownCategoryIds.has(data.catalogCategoryId) &&
        data.catalogCategoryId !== catalog.categoryId) return false;
    if (data.catalogGroupId && data.catalogGroupId !== catalog.groupId) return false;
  }
  return left.valid && right.valid && left.catalogKey === right.catalogKey &&
    left.subcategoryKey === right.subcategoryKey;
}

export function matchingPair(request: MatchPublication, listing: MatchPublication) {
  return typeof request.customerId === "string" && Boolean(request.customerId) &&
    typeof listing.authorId === "string" && Boolean(listing.authorId) &&
    !request.customerId.includes("/") && !listing.authorId.includes("/") &&
    request.customerId !== listing.authorId &&
    eligiblePublication(request, "request") && eligiblePublication(listing, "listing") &&
    sameCatalogPath(request, listing);
}

export function publicationAddress(data: MatchPublication): string {
  const city = typeof data.city === "string" ? data.city.trim() : "";
  const address = typeof data.address === "string" ? data.address.trim() : "";
  // A city centroid cannot establish that two people are within 10 km.
  if (!city || !address || city.toLocaleLowerCase("ru") === address.toLocaleLowerCase("ru")) return "";
  return `${city}, ${address}`.replace(/\s+/g, " ").slice(0, 500);
}

export function nearbyDeliveryKey(requestId: string, recipientId: string) {
  // Independent of listing ID, worker run and which publication was created first.
  return `nearby-request:v1:${requestId}:${recipientId}`;
}

export function readableDistance(km: number) {
  if (km < 0.1) return "менее 100 м";
  return `около ${km.toFixed(1).replace(".", ",")} км`;
}
