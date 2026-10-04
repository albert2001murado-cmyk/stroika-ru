import type { ModerationFlag } from "./publication-policy";

type Decision = "approved" | "rejected" | "manual_review";
const fieldNames: Record<string, string> = {
  title: "Название", description: "Описание", category: "Каталог и категория",
  city: "Город", media: "Фото и видео", content: "Содержание", payment: "Оплата и реквизиты", owner: "Профиль автора",
};
function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max) : "";
}
export function moderationReasonDetails(decision: Decision, flags: ModerationFlag[]): string[] {
  const relevant = flags.filter(flag => flag && clean(flag.message) &&
    (decision !== "rejected" || flag.severity === "critical" || flag.severity === "changes"));
  const priority = { critical: 0, changes: 1, review: 2 };
  const seen = new Set<string>();
  return [...relevant].sort((a,b) => priority[a.severity] - priority[b.severity]).flatMap(flag => {
    const message = clean(flag.message);
    if (seen.has(message)) return [];
    seen.add(message);
    const label = fieldNames[flag.field] || (flag.field.startsWith("media") ? "Фото и видео" : "");
    return [label ? `${label}: ${message}` : message];
  }).slice(0, 20);
}
export function publicationModerationReason(decision: Decision, flags: ModerationFlag[]) {
  if (decision === "approved") return "Автоматическая проверка пройдена.";
  const reasons = moderationReasonDetails(decision, flags);
  if (reasons.length) return reasons.map((message,index) => `${index + 1}. ${message}`).join("\n");
  return "Система не вернула конкретную причину. Публикация требует проверки модератором.";
}
export function validateManualModerationReason(value: unknown): string | null {
  const reason = clean(value, 1000);
  if (reason.length < 15 || /^(публикация не соответствует правилам размещения|нарушение правил|отказ|не подходит|исправьте публикацию)[.!\s]*$/iu.test(reason)) {
    return "Укажите конкретную причину и что нужно исправить: например, «На фото указан телефон. Загрузите фото без контактных данных».";
  }
  return null;
}
export function publicationModerationNotice(input: {
  kind: "listing" | "request"; id: string; title: unknown; decision: Decision; reason: string;
}) {
  const name = clean(input.title, 80) || "Публикация";
  const detailUrl = `${input.kind === "listing" ? "/listing" : "/requests"}/${encodeURIComponent(input.id)}`;
  if (input.decision === "approved") return {
    title: "Публикация одобрена", body: `«${name}» прошла проверку и опубликована.`, url: detailUrl, actionLabel: "Открыть публикацию",
  };
  if (input.decision === "manual_review") return {
    title: "Нужна дополнительная проверка", body: `«${name}»\n\nПричина проверки:\n${input.reason}\n\nПубликация ещё не отклонена. Мы сообщим о решении модератора.`,
    url: detailUrl, actionLabel: "Открыть публикацию",
  };
  return {
    title: "Публикацию нужно исправить", body: `«${name}»\n\nЧто нужно исправить:\n${input.reason}\n\nИсправьте замечания и отправьте публикацию на проверку повторно.`,
    url: `${detailUrl}/edit`, actionLabel: input.kind === "listing" ? "Исправить объявление" : "Исправить заявку",
  };
}
