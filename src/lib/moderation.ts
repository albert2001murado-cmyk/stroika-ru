export type PublicationModerationStatus =
  | "pending"
  | "manual_review"
  | "approved"
  | "rejected";

export function isPublicationApproved(item: { moderationStatus?: unknown } | null | undefined) {
  if (!item) return false;
  const status = String(item.moderationStatus || "");
  return status === "" || status === "approved";
}

export function moderationLabel(status?: unknown) {
  if (status === "pending") return "На модерации";
  if (status === "manual_review") return "Дополнительная проверка";
  if (status === "rejected") return "Нужно исправить";
  return "Опубликовано";
}
