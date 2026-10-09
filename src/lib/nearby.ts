import { publicationCatalogSelection, normalizeCatalogText } from "./catalogSelection";
import { matchesOfferSelection, type SearchableListingFields } from "./listingOffer";
import { isPublicationApproved } from "./moderation";
import { publicationSearchRelevanceScore } from "./searchKeywords";
import type { CatalogSectionId } from "@/data/catalogForm";

export type Coordinates = { lat: number; lng: number };
export type NearbyAudience = "contractors" | "customers" | "all";
export type NearbySort = "nearest" | "newest" | "priceAsc" | "priceDesc";
export type NearbyPublication = SearchableListingFields & {
  id: string;
  kind: "contractor" | "request";
  title?: string;
  name?: string;
  description?: string;
  subcategory?: string;
  catalogSection?: string;
  catalogCategoryId?: string;
  catalogCategoryTitle?: string;
  catalogGroupId?: string | null;
  city?: string;
  district?: string;
  address?: string;
  status?: string;
  price?: string | number | null;
  priceFrom?: string | number | null;
  budget?: string | number | null;
  budgetFrom?: string | number | null;
  budgetTo?: string | number | null;
  authorName?: string;
  userName?: string;
  companyName?: string;
  displayName?: string;
  customerName?: string;
  accountType?: string;
  imageUrl?: string;
  photoUrl?: string;
  avatarUrl?: string;
  photos?: string[];
  images?: string[];
  imageUrls?: string[];
  media?: Array<{ url?: string; type?: string }>;
  authorId?: string;
  customerId?: string;
  userId?: string;
  ownerId?: string;
  creatorId?: string;
  uid?: string;
  latitude?: number | string;
  longitude?: number | string;
  lat?: number | string;
  lng?: number | string;
  coordinates?: { latitude?: number | string; longitude?: number | string; lat?: number | string; lng?: number | string };
  location?: { latitude?: number | string; longitude?: number | string; lat?: number | string; lng?: number | string; address?: string };
  createdAt?: unknown;
  isUrgent?: boolean;
  urgency?: string;
  verified?: boolean;
  isVerified?: boolean;
  authorVerified?: boolean;
  userVerified?: boolean;
  verificationStatus?: string;
  moderationStatus?: unknown;
};

export type NearbyFilters = {
  audience: NearbyAudience;
  section: CatalogSectionId | "";
  categoryId: string;
  subcategory: string;
  search: string;
  city: string;
  radius: number | null;
  hasOrigin: boolean;
  mainActions: string[];
  features: string[];
  priceMin: string;
  priceMax: string;
  onlyVerified: boolean;
  onlyUrgent: boolean;
  withPhoto: boolean;
  sort: NearbySort;
};

export type IndexedNearbyPublication = {
  item: NearbyPublication;
  key: string;
  coords: Coordinates | null;
  distance: number | null;
  selection: ReturnType<typeof publicationCatalogSelection>;
  subcategory: string;
  city: string;
  image: string;
  price: { from: number | null; to: number | null };
  created: number;
  verified: boolean;
  urgent: boolean;
};

const catalogCache = new Map<string, ReturnType<typeof publicationCatalogSelection>>();
const publicationIndexCache = new WeakMap<NearbyPublication, Omit<IndexedNearbyPublication, "coords" | "distance">>();

export function nearbyKey(item: Pick<NearbyPublication, "id" | "kind">) {
  return `${item.kind}:${item.id}`;
}

export function normalizeCoordinates(latValue: unknown, lngValue: unknown): Coordinates | null {
  const number = (value: unknown) => value === "" || value == null ? NaN : Number(String(value).replace(",", "."));
  let lat = number(latValue);
  let lng = number(lngValue);
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) [lat, lng] = [lng, lat];
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng } : null;
}

export function publicationCoordinates(item: NearbyPublication): Coordinates | null {
  return normalizeCoordinates(item.location?.lat, item.location?.lng)
    || normalizeCoordinates(item.location?.latitude, item.location?.longitude)
    || normalizeCoordinates(item.coordinates?.lat, item.coordinates?.lng)
    || normalizeCoordinates(item.coordinates?.latitude, item.coordinates?.longitude)
    || normalizeCoordinates(item.lat, item.lng)
    || normalizeCoordinates(item.latitude, item.longitude);
}

export function distanceKm(origin: Coordinates, point: Coordinates) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const a = Math.sin(radians(point.lat - origin.lat) / 2) ** 2
    + Math.cos(radians(origin.lat)) * Math.cos(radians(point.lat))
    * Math.sin(radians(point.lng - origin.lng) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
}

export function distanceLabel(distance: number | null) {
  if (distance === null) return "Расстояние не определено";
  if (distance < 1) return `${Math.round(distance * 1000)} м от вас`;
  return `${distance.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} км от вас`;
}

export function publicationAddress(item: NearbyPublication) {
  return item.location?.address?.trim() || [item.city, item.district, item.address].filter(Boolean).join(", ");
}

export function publicationOwner(item: NearbyPublication) {
  return item.customerId || item.authorId || item.userId || item.ownerId || item.creatorId || item.uid || "";
}

export function publicationAuthor(item: NearbyPublication) {
  return item.companyName || item.customerName || item.authorName || item.userName || item.displayName
    || (item.kind === "request" ? "Заказчик" : item.accountType === "ooo" ? "Компания" : item.accountType === "ip" ? "ИП" : "Исполнитель");
}

export function publicationLink(item: NearbyPublication) {
  return `/${item.kind === "request" ? "requests" : "listing"}/${encodeURIComponent(item.id)}`;
}

export function verifiedPublication(item: NearbyPublication) {
  return Boolean(item.verified || item.isVerified || item.authorVerified || item.userVerified || item.verificationStatus === "approved");
}

export function safeImageUrl(value: unknown) {
  const url = typeof value === "string" ? value.trim() : "";
  return /^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url) ? url : "";
}

export function publicationImage(item: NearbyPublication) {
  const candidates = [item.imageUrl, item.photoUrl, ...(item.imageUrls || []), ...(item.photos || []), ...(item.images || []),
    ...(item.media || []).filter(media => media.type === "image" || /\.(jpe?g|png|webp|gif)(?:\?|$)/i.test(media.url || "")).map(media => media.url)];
  return candidates.map(safeImageUrl).find(Boolean) || "";
}

export function priceNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const normalized = typeof value === "number" ? value : Number(String(value).replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(normalized) && normalized >= 0 && /\d/.test(String(value)) ? normalized : null;
}

export function publicationPrice(item: NearbyPublication) {
  if (item.kind === "request") {
    const from = priceNumber(item.budgetFrom ?? item.budget);
    return { from, to: priceNumber(item.budgetTo) ?? from };
  }
  const from = priceNumber(item.priceFrom ?? item.price);
  return { from, to: from };
}

export function priceLabel(item: NearbyPublication) {
  const { from, to } = publicationPrice(item);
  const format = (value: number) => value.toLocaleString("ru-RU");
  if (from !== null && to !== null && from !== to) return `${format(from)}–${format(to)} ₽`;
  if (from !== null) return `${item.kind === "contractor" && item.priceFrom != null ? "от " : ""}${format(from)} ₽`;
  if (to !== null) return `до ${format(to)} ₽`;
  return item.kind === "request" ? "Бюджет договорной" : "Цена договорная";
}

export function timestampMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime() || 0;
  if (value && typeof value === "object") {
    const time = value as { toMillis?: () => number; seconds?: number };
    if (typeof time.toMillis === "function") return time.toMillis() || 0;
    if (typeof time.seconds === "number") return time.seconds * 1000;
  }
  if (typeof value === "number") return value;
  return typeof value === "string" ? Date.parse(value) || 0 : 0;
}

export function indexNearbyPublication(item: NearbyPublication, coords: Coordinates | null, origin: Coordinates | null, ownerVerified = false): IndexedNearbyPublication {
  let indexed = publicationIndexCache.get(item);
  if (!indexed) {
    const pathKey = JSON.stringify([item.catalogSection, item.catalogCategoryId, item.catalogGroupId, item.category, item.subcategory]);
    let selection = catalogCache.get(pathKey);
    if (!selection) {
      selection = publicationCatalogSelection(item);
      if (catalogCache.size >= 1024) catalogCache.clear();
      catalogCache.set(pathKey, selection);
    }
    indexed = {
      item, key: nearbyKey(item), selection,
      subcategory: normalizeCatalogText(item.subcategory),
      city: normalizeCatalogText([item.city, publicationAddress(item)].join(" ")).replace(/^г\s+/, ""),
      image: publicationImage(item), price: publicationPrice(item), created: timestampMillis(item.createdAt),
      verified: verifiedPublication(item), urgent: Boolean(item.isUrgent || item.urgency === "urgent"),
    };
    publicationIndexCache.set(item, indexed);
  }
  return {
    ...indexed, coords,
    distance: coords && origin ? distanceKm(origin, coords) : null,
    verified: indexed.verified || ownerVerified,
  };
}

export function filterNearbyPublications(entries: IndexedNearbyPublication[], filters: NearbyFilters) {
  const city = normalizeCatalogText(filters.city).replace(/^г\s+/, "");
  const subcategory = normalizeCatalogText(filters.subcategory);
  const min = priceNumber(filters.priceMin);
  const max = priceNumber(filters.priceMax);
  const scores = new Map<string, number>();
  const results = entries.filter(entry => {
    const { item, selection, distance, price } = entry;
    if (!isPublicationApproved(item) || (item.kind === "request" && item.status && item.status !== "active")) return false;
    if (filters.audience === "contractors" && item.kind !== "contractor") return false;
    if (filters.audience === "customers" && item.kind !== "request") return false;
    if (filters.section && selection.section !== filters.section) return false;
    if (filters.categoryId && selection.categoryId !== filters.categoryId) return false;
    if (subcategory && entry.subcategory !== subcategory) return false;
    if (city && !entry.city.includes(city)) return false;
    if (filters.radius !== null && filters.hasOrigin && (distance === null || distance > filters.radius)) return false;
    if (filters.onlyVerified && !entry.verified) return false;
    if (filters.onlyUrgent && !entry.urgent) return false;
    if (filters.withPhoto && !entry.image) return false;
    // Стоимость заявки — диапазон: достаточно его пересечения с фильтром.
    if ((min !== null || max !== null) && price.from === null && price.to === null) return false;
    if (min !== null && (price.to ?? Infinity) < min) return false;
    if (max !== null && (price.from ?? 0) > max) return false;
    // Опции предложения принадлежат исполнителям, а не заявкам заказчиков.
    if (item.kind === "contractor" && !matchesOfferSelection(item, filters.mainActions.join(","), filters.features)) return false;
    const score = publicationSearchRelevanceScore(item, filters.search);
    if (score < 0) return false;
    scores.set(entry.key, score);
    return true;
  });
  return results.sort((left, right) => {
    if (filters.sort === "priceAsc" || filters.sort === "priceDesc") {
      const leftPrice = left.price.from ?? left.price.to;
      const rightPrice = right.price.from ?? right.price.to;
      if (leftPrice === null && rightPrice !== null) return 1;
      if (rightPrice === null && leftPrice !== null) return -1;
      if (leftPrice !== null && rightPrice !== null && leftPrice !== rightPrice) return filters.sort === "priceAsc" ? leftPrice - rightPrice : rightPrice - leftPrice;
    } else if (filters.sort === "newest") {
      if (left.created !== right.created) return right.created - left.created;
    } else {
      const relevance = (scores.get(right.key) || 0) - (scores.get(left.key) || 0);
      if (filters.search.trim() && relevance) return relevance;
      const distance = (left.distance ?? Infinity) - (right.distance ?? Infinity);
      if (Number.isFinite(distance) && distance) return distance;
      if (left.distance === null && right.distance !== null) return 1;
      if (right.distance === null && left.distance !== null) return -1;
    }
    return right.created - left.created || left.key.localeCompare(right.key);
  });
}

// Яндекс.Карты принимают HTML для подсказок; данные пользователя должны оставаться текстом.
export function escapeMapHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
}
