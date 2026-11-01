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
  { id: "finishing", title: "Есть планы на отделку?", body: "Найдите мастера под свою задачу и сравните предложения в Строве", url: "/(tabs)/search?section=services&q=отделка" },
  { id: "materials", title: "Что нужно для следующего этапа?", body: "Загляните в каталог материалов — от небольшого ремонта до большой стройки", url: "/(tabs)/search?section=materials" },
  { id: "equipment", title: "Большим задачам — подходящая техника", body: "Посмотрите предложения аренды техники для вашего проекта", url: "/(tabs)/search?section=equipment" },
  { id: "solutions", title: "Хотите решить задачу целиком?", body: "В комплексных решениях можно найти команду для ремонта, стройки и проектирования", url: "/(tabs)/search?section=solutions" },
  { id: "masters", title: "Мастер для вашей идеи", body: "Посмотрите услуги в Строве — возможно, здесь начнётся ваш следующий проект", url: "/(tabs)/search?section=services" },
  { id: "compare", title: "Выбрать проще, когда есть с чем сравнить", body: "Добавляйте подходящие объявления в сравнение и возвращайтесь к ним из профиля", url: "/compare" },
  { id: "publish", title: "Расскажите, с чем можете помочь", body: "Разместите своё предложение или задачу — так вы сможете найти друг друга", url: "/(tabs)/profile" },
  { id: "project", title: "От идеи до первого шага", body: "Материалы, мастера и техника — найдите нужное для своего проекта в Строве", url: "/(tabs)/search" },
] as const;
