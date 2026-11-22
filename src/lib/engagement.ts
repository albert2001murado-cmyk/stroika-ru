export type EngagementPreferences = {
  enabled: boolean; expiryReminders: boolean; intervalMinutes: 120;
  quietHours: boolean; quietStart: number; quietEnd: number; timeZone: "Europe/Moscow";
  topics: Array<{ key: string; label: string; city: string; viewedAt: number }>;
};
export const ENGAGEMENT_INTERVAL_MS = 120 * 60_000;
export const DEFAULT_ENGAGEMENT: EngagementPreferences = { enabled: false, expiryReminders: false, intervalMinutes: 120, quietHours: true, quietStart: 23, quietEnd: 9, timeZone: "Europe/Moscow", topics: [] };
export function inEngagementQuietHours(value: Pick<EngagementPreferences, "quietHours" | "quietStart" | "quietEnd">, now = Date.now()) {
  if (!value.quietHours || value.quietStart === value.quietEnd) return false;
  const hour = (new Date(now).getUTCHours() + 3) % 24;
  return value.quietStart < value.quietEnd ? hour >= value.quietStart && hour < value.quietEnd : hour >= value.quietStart || hour < value.quietEnd;
}
/** Invitations, not invented claims about new listings, prices or user activity. */
export const DISCOVERY_PROMPTS = [
  { id: "finishing", title: "🛠️ Есть планы на ремонт?", body: "Посмотрите мастеров по отделке и выберите, кому доверить работу", url: "/(tabs)/search?section=services&q=отделка" },
  { id: "materials", title: "🧱 Что нужно для следующего этапа?", body: "Загляните в материалы, возможно, найдётся то, что вы искали", url: "/(tabs)/search?section=materials" },
  { id: "equipment", title: "🚜 Техника для ваших задач", body: "Экскаватор, кран или самосвал? Посмотрите предложения аренды рядом", url: "/(tabs)/search?section=equipment" },
  { id: "solutions", title: "🏡 Пора заняться своим проектом?", body: "Найдите команду для ремонта, строительства или проектирования", url: "/(tabs)/search?section=solutions" },
  { id: "masters", title: "🛠️ Найдётся мастер для вашей идеи", body: "Посмотрите услуги в Строве и сохраните подходящие предложения", url: "/(tabs)/search?section=services" },
  { id: "compare", title: "Выбираете между несколькими мастерами?", body: "Добавьте объявления в сравнение, так будет удобнее определиться", url: "/compare" },
  { id: "publish", title: "👋 Расскажите, чем можете помочь", body: "Разместите объявление, чтобы заказчики могли вас найти", url: "/(tabs)/profile" },
  { id: "project", title: "🏗️ Что у вас в планах?", body: "Мастера, материалы и техника для следующего шага уже в каталоге", url: "/(tabs)/search" },
] as const;
