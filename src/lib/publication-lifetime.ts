// Keep this file identical in the website and mobile app.
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

export function publicationDateMillis(value: unknown): number {
  if (value == null) return 0;
  let millis = 0;
  if (value instanceof Date) millis = value.getTime();
  else if (typeof value === "number") millis = value;
  else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) millis = Date.parse(value);
  else if (typeof value === "object") {
    const stamp = value as { toMillis?: () => number; seconds?: unknown; nanoseconds?: unknown; _seconds?: unknown; _nanoseconds?: unknown };
    try {
      if (typeof stamp.toMillis === "function") millis = stamp.toMillis();
      else {
        const seconds = stamp.seconds ?? stamp._seconds;
        const nanos = stamp.nanoseconds ?? stamp._nanoseconds ?? 0;
        if (typeof seconds === "number" && typeof nanos === "number") millis = seconds * 1000 + nanos / 1e6;
      }
    } catch { return 0; }
  }
  return Number.isFinite(millis) && millis > 0 && millis <= 8.64e15 ? millis : 0;
}

// A calendar month at the same Moscow time; January 31 ends on February 28/29.
export function oneCalendarMonthAfter(millis: number): number {
  const start = new Date(millis + MOSCOW_OFFSET_MS);
  const day = start.getUTCDate();
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(day, lastDay));
  return start.getTime() - MOSCOW_OFFSET_MS;
}

export function publicationExpiryMillis(item: unknown): number {
  if (!item || typeof item !== "object") return 0;
  const value = item as Record<string, unknown>;
  const created = publicationDateMillis(value.createdAt) || publicationDateMillis(value.publishedAt);
  const calculated = created ? oneCalendarMonthAfter(created) : 0;
  const saved = publicationDateMillis(value.expiresAt);
  // An edited publishedAt, updatedAt or a later expiresAt cannot extend the term.
  return calculated && saved ? Math.min(calculated, saved) : calculated || saved;
}

export function isPublicationExpired(item: unknown, now = Date.now()): boolean {
  const deadline = publicationExpiryMillis(item);
  return deadline > 0 && now >= deadline;
}

export function nextPublicationExpiry(items: readonly unknown[], now: number): number {
  return items.reduce<number>((next, item) => {
    const deadline = publicationExpiryMillis(item);
    return deadline > now && (!next || deadline < next) ? deadline : next;
  }, 0);
}

export function publicationTermText(item: unknown, now = Date.now()): string {
  const deadline = publicationExpiryMillis(item);
  if (!deadline) return "Срок размещения — один календарный месяц.";
  const date = new Date(deadline + MOSCOW_OFFSET_MS);
  const pad = (value: number) => String(value).padStart(2, "0");
  const formatted = `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()} в ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} МСК`;
  return now >= deadline ? `Срок истёк ${formatted}. Объявление снято с публикации.` : `Размещено до ${formatted}.`;
}

export function publicationTermDisplay(item: unknown, now = Date.now()) {
  const deadline = publicationExpiryMillis(item);
  const source = item && typeof item === "object" ? item as Record<string, unknown> : {};
  const start = publicationDateMillis(source.createdAt) || publicationDateMillis(source.publishedAt);
  const expired = deadline > 0 && now >= deadline;
  const remaining = Math.max(0, deadline - now);
  const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const date = new Date(deadline + MOSCOW_OFFSET_MS);
  const pad = (value: number) => String(value).padStart(2, "0");
  const plural = (n: number, one: string, few: string, many: string) => n % 100 >= 11 && n % 100 <= 14 ? many : n % 10 === 1 ? one : n % 10 >= 2 && n % 10 <= 4 ? few : many;
  const days = Math.ceil(remaining / 86_400_000);
  const hours = Math.ceil(remaining / 3_600_000);
  const minutes = Math.ceil(remaining / 60_000);
  const countdown = expired ? "Объявление скрыто из поиска" : remaining >= 86_400_000
    ? `Осталось ${days} ${plural(days, "день", "дня", "дней")}`
    : remaining >= 3_600_000 ? `Осталось ${hours} ч` : remaining >= 60_000 ? `Осталось ${minutes} мин` : "Меньше минуты";
  return {
    deadline, expired, endingSoon: !expired && remaining > 0 && remaining <= 3 * 86_400_000,
    date: deadline ? `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}` : "",
    time: deadline ? `в ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} МСК` : "",
    countdown: deadline ? countdown : "Срок размещения — один месяц",
    remainingPercent: !deadline || expired ? 0 : Math.max(0, Math.min(100, remaining / Math.max(1, deadline - start) * 100)),
  };
}
