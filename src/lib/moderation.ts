import { isPublicationExpired } from "./publication-lifetime";

export type PublicationModerationStatus =
  | "pending"
  | "manual_review"
  | "approved"
  | "rejected";

export function isPublicationModerationApproved(item: { moderationStatus?: unknown } | null | undefined) {
  if (!item) return false;
  const status = String(item.moderationStatus || "");
  return status === "" || status === "approved";
}

export function isPublicationApproved(source: unknown) {
  if (!source || typeof source !== "object") return false;
  const item = source as Record<string, unknown>;
  return !item.deleted && !item.isDeleted && !item.hidden && !item.isHidden && !item.archived && item.isActive !== false &&
    !["closed", "inactive", "archived", "deleted", "canceled", "cancelled", "completed", "paused"].includes(String(item.status || "")) &&
    isPublicationModerationApproved({ moderationStatus: item.moderationStatus }) && !isPublicationExpired(item);
}

export function isReviewApproved(item: { moderationStatus?: unknown } | null | undefined) {
  if (!item) return false;
  const status = String(item.moderationStatus || "");
  // Отзывы, созданные до появления модерации, остаются видимыми.
  return status === "" || status === "approved";
}

export function moderationLabel(status?: unknown) {
  if (status === "payment_required") return "Оплата возвращена";
  if (status === "pending") return "На модерации";
  if (status === "manual_review") return "Дополнительная проверка";
  if (status === "rejected") return "Нужно исправить";
  return "Опубликовано";
}
