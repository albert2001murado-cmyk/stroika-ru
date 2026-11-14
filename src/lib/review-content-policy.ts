import { containsExplicitAdultText, containsProhibitedLanguage } from "./content-language-policy";

export const REVIEW_POLICY_VERSION = "review-2026-11-14.1";
const PHONE = /(?:\+?7|8)[\s()\-]*\d{3}[\s()\-]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/u;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/u;
const URL = /(?:https?:\/\/|www\.|t\.me\/|vk\.com\/|wa\.me\/)[^\s]+/iu;

export function reviewDecision(data: Record<string, unknown>): {
  decision: "approved" | "rejected"; code: string; reason: string;
} {
  const text = typeof data.text === "string" ? data.text.trim() : "";
  const rating = data.rating;
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { decision: "rejected", code: "invalid-rating", reason: "Укажите целую оценку от 1 до 5." };
  }
  if (text.length < 3 || text.length > 1000) {
    return { decision: "rejected", code: "invalid-review-length", reason: "Текст отзыва должен содержать от 3 до 1000 символов." };
  }
  if (containsProhibitedLanguage(text)) {
    return { decision: "rejected", code: "profanity-in-review", reason: "Удалите оскорбления и нецензурную лексику." };
  }
  if (containsExplicitAdultText(text)) {
    return { decision: "rejected", code: "explicit-review", reason: "Контент для взрослых и интимные услуги запрещены в Строве." };
  }
  if (PHONE.test(text) || EMAIL.test(text) || URL.test(text)) {
    return { decision: "rejected", code: "contacts-in-review", reason: "Удалите из отзыва телефон, почту или ссылку." };
  }
  const normalized = text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  if (/^(.)\1{7,}$/u.test(normalized)) {
    return { decision: "rejected", code: "review-spam", reason: "Отзыв похож на спам. Опишите результат работы обычным текстом." };
  }
  // A negative, polite review is allowed. Sentiment is not a reason for rejection.
  return { decision: "approved", code: "", reason: "" };
}
