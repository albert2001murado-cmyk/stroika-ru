import { catalogCategoryLabel, catalogLabel } from "../data/catalogLabels";
import { paymentLabel } from "./payments";

export const MAX_COMPARISON_LISTINGS = 3;
export const COMPARISON_SCHEMA_VERSION = 2;
export function validComparisonId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && !value.includes("/") && value !== "." && value !== "..";
}

/** Old user IDs are deliberately ignored: selecting a person is not selecting their offer. */
export function comparisonListingIds(data: Record<string, unknown> | null | undefined): string[] {
  if (data?.schemaVersion !== COMPARISON_SCHEMA_VERSION || !Array.isArray(data.listingIds)) return [];
  return [...new Set(data.listingIds.filter(validComparisonId))].slice(0, MAX_COMPARISON_LISTINGS);
}

export function nextComparisonIds(current: readonly string[], action: "add" | "remove" | "clear", id = "") {
  if (action === "clear") return [];
  if (!validComparisonId(id)) throw new Error("Не удалось определить объявление");
  if (action === "remove") return current.filter(value => value !== id);
  if (current.includes(id)) return [...current];
  if (current.length >= MAX_COMPARISON_LISTINGS) throw new Error("В сравнении уже три анкеты. Уберите одну, чтобы добавить новую");
  return [...current, id];
}

export function comparisonOwnerId(data: Record<string, any>) {
  return [data.authorId, data.authorUid, data.userId, data.userUid, data.ownerId, data.creatorId, data.createdBy, data.uid].find(value => typeof value === "string" && value) || "";
}

export type ComparisonListing = {
  id: string; title: string; image: string; category: string; subcategory: string;
  city: string; price: string; minimum: string; payment: string; description: string;
  ownerName: string; verified: boolean; rating: string; reviewsCount: number;
};

export function comparisonListing(id: string, data: Record<string, any>, author: Record<string, any> | null, reviews: Record<string, any>[]): ComparisonListing {
  const image = data.imageUrls?.[0] || data.imageUrl || data.coverUrl || data.photos?.[0] || data.images?.[0]
    || data.media?.find((item: any) => item?.type === "image" && typeof item.url === "string")?.url || "";
  const ratings = reviews.map(item => Number(item.rating)).filter(value => Number.isFinite(value) && value >= 1 && value <= 5);
  const amount = Number(data.priceFrom ?? data.price);
  const trusted = author || data;
  return {
    id, title: String(data.title || data.name || "Без названия"), image: typeof image === "string" ? image : "",
    category: catalogCategoryLabel(data), subcategory: catalogLabel(data.subcategory, data),
    city: String(data.city || "Не указан"),
    price: Number.isFinite(amount) && amount > 0 ? `от ${amount.toLocaleString("ru-RU")} ₽` : "Договорная",
    minimum: Number(data.minimumWorkAmount) > 0 ? `${Number(data.minimumWorkAmount).toLocaleString("ru-RU")} ${data.minimumWorkUnit || "ед."}` : "Не указан",
    payment: paymentLabel(data.paymentMethods), description: String(data.description || "Описание не добавлено"),
    ownerName: String(author?.displayName || author?.companyName || author?.name || data.authorName || "Исполнитель"),
    verified: trusted.verified === true || trusted.isVerified === true || trusted.verificationStatus === "approved" || trusted.verificationStatus === "verified",
    rating: ratings.length ? (ratings.reduce((sum, n) => sum + n, 0) / ratings.length).toFixed(1) : "Нет отзывов",
    reviewsCount: ratings.length,
  };
}

export const COMPARISON_ROWS: { key: "price" | "rating" | "city" | "subcategory" | "minimum" | "payment" | "description"; title: string }[] = [
  { key: "price", title: "Стоимость" }, { key: "rating", title: "Отзывы об анкете" },
  { key: "city", title: "Город" }, { key: "subcategory", title: "Направление" },
  { key: "minimum", title: "Минимальный объём" }, { key: "payment", title: "Оплата" },
  { key: "description", title: "Об услуге" },
];
