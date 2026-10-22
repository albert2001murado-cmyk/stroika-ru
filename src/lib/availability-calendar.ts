export const CALENDAR_STATUSES = ["free", "busy", "reserved", "dayoff"] as const;
export type CalendarStatus = (typeof CALENDAR_STATUSES)[number];
export type AvailabilityDay = { id: string; date: string; status: CalendarStatus };
export type AvailabilityDays = Record<string, AvailabilityDay>;

export const CALENDAR_STATUS: Record<CalendarStatus, { label: string; short: string; description: string; summary: string }> = {
  free: { label: "Свободен", short: "Свободен", description: "Готов принять заказ", summary: "свободных дней" },
  busy: { label: "Занят", short: "Занят", description: "Работа уже запланирована", summary: "занятых дней" },
  reserved: { label: "Предварительная бронь", short: "Бронь", description: "Ожидаю подтверждения", summary: "предварительные брони" },
  dayoff: { label: "Выходной", short: "Выходной", description: "Без новых заказов", summary: "выходных дней" },
};
export const CALENDAR_MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
export const CALENDAR_WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function calendarDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function calendarDate(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split("-").map(Number);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const result = new Date(year, month - 1, day, 12);
  return calendarDateKey(result) === key ? result : null;
}

export function calendarMonthKey(month: Date): string { return calendarDateKey(month).slice(0, 7); }

export function calendarCells(month: Date) {
  const year = month.getFullYear(), index = month.getMonth();
  const offset = (new Date(year, index, 1, 12).getDay() + 6) % 7;
  const length = Math.ceil((offset + new Date(year, index + 1, 0, 12).getDate()) / 7) * 7;
  return Array.from({ length }, (_, position) => {
    const date = new Date(year, index, position - offset + 1, 12);
    return { date, key: calendarDateKey(date), day: date.getDate(), currentMonth: date.getMonth() === index };
  });
}

export function normalizeAvailabilityDay(id: string, value: unknown): AvailabilityDay | null {
  if (!calendarDate(id) || !value || typeof value !== "object") return null;
  const status = (value as Record<string, unknown>).status;
  if (!CALENDAR_STATUSES.includes(status as CalendarStatus)) return null;
  return { id, date: id, status: status as CalendarStatus };
}

export function calendarStats(days: AvailabilityDays, month: Date) {
  const prefix = calendarMonthKey(month) + "-";
  const result: Record<CalendarStatus, number> = { free: 0, busy: 0, reserved: 0, dayoff: 0 };
  for (const day of Object.values(days)) if (day.date.startsWith(prefix)) result[day.status]++;
  return result;
}

export function nextCalendarFreeDay(days: AvailabilityDays, month: Date, today: string): string | undefined {
  const prefix = calendarMonthKey(month) + "-";
  return Object.values(days).filter(day => day.status === "free" && day.date.startsWith(prefix) && day.date >= today).map(day => day.date).sort()[0];
}

export function calendarDayLabel(key: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }): string {
  const date = calendarDate(key);
  return date ? new Intl.DateTimeFormat("ru-RU", options).format(date) : "";
}

export function toggleCalendarDate(current: readonly string[], key: string, multiple = true): string[] {
  if (!calendarDate(key)) return [...current];
  return current.includes(key) ? current.filter(value => value !== key) : multiple ? [...current, key] : [key];
}

export function calendarPalette(dark = false) {
  return dark ? {
    background: "#0a1526", card: "#101d31", navy: "#e2ecff", ink: "#e2e8f0", muted: "#a4b3c8", faint: "#697d99", border: "#29405f",
    blue: "#86b0ff", selected: "#0057ff", blueSoft: "#17345f", blueBorder: "#47689f", busy: "#1c2b40", busyInk: "#b3c0d2",
    amber: "#f4c768", amberSoft: "#352b17", amberBorder: "#715b2d", yellow: "#f3c945", off: "#142135", white: "#ffffff",
  } : {
    background: "#f5f7fb", card: "#ffffff", navy: "#173f76", ink: "#22344d", muted: "#67768a", faint: "#a7b0be", border: "#e2e8f1",
    blue: "#0057ff", selected: "#0057ff", blueSoft: "#eaf1ff", blueBorder: "#c9daff", busy: "#edf0f5", busyInk: "#53657b",
    amber: "#ae6d00", amberSoft: "#fff3d7", amberBorder: "#edd8a8", yellow: "#f3c945", off: "#f8f9fb", white: "#ffffff",
  };
}
