/** Keep identical in the website and Expo app. Monetary values use integer kopecks. */
export const BILLING_DAY_MS = 86_400_000;
export const BILLING_PERIOD_MS = 30 * BILLING_DAY_MS;
export const BILLING_CATALOGS = ["materials", "services", "equipment", "solutions"] as const;
export type BillingCatalog = (typeof BILLING_CATALOGS)[number];
export type BillingTier = "start" | "business" | "pro" | "max";
export type BillingPlan = {
  catalog: BillingCatalog; tier: BillingTier; title: string;
  paid: number; gift: number; limit: number; priceKopeks: number;
};
export const CATALOG_TITLES: Record<BillingCatalog, string> = {
  materials: "Материалы", services: "Услуги", equipment: "Техника", solutions: "Комплексные решения",
};
export const INTRO_LIMITS: Record<BillingCatalog, number> = { materials: 3, services: 1, equipment: 2, solutions: 1 };
const titles: Record<BillingTier, string> = { start: "Старт", business: "Бизнес", pro: "Профи", max: "Максимум" };
const rows: Record<BillingCatalog, Array<[BillingTier, number, number, number]>> = {
  materials: [["start", 2, 1, 299], ["business", 5, 2, 599], ["pro", 11, 4, 999], ["max", 18, 7, 1499]],
  services: [["start", 2, 0, 399], ["business", 4, 1, 799], ["pro", 7, 3, 1399]],
  equipment: [["start", 2, 0, 599], ["business", 4, 1, 1299], ["pro", 8, 2, 2299]],
  solutions: [["start", 2, 0, 699], ["business", 4, 1, 1499], ["pro", 7, 3, 2499]],
};
export const BILLING_PLANS: BillingPlan[] = BILLING_CATALOGS.flatMap(catalog => rows[catalog].map(([tier, paid, gift, rubles]) => ({
  catalog, tier, title: titles[tier], paid, gift, limit: paid + gift, priceKopeks: rubles * 100,
})));
export function isBillingCatalog(value: unknown): value is BillingCatalog { return BILLING_CATALOGS.includes(value as BillingCatalog); }
export function getBillingPlan(catalog: unknown, tier: unknown) { return BILLING_PLANS.find(p => p.catalog === catalog && p.tier === tier) || null; }
export function billingPrice(kopeks: number) { return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(kopeks / 100); }
export function billingCount(count: number, one = "объявление", few = "объявления", many = "объявлений") {
  const rest = count % 100;
  return `${count} ${rest >= 11 && rest <= 14 ? many : count % 10 === 1 ? one : count % 10 >= 2 && count % 10 <= 4 ? few : many}`;
}
export const BILLING_RULES = [
  "Каждый каталог оплачивается отдельно",
  "Подписка и каждое новое размещение действуют 30 дней",
  "Подарочные объявления уже включены в общий лимит тарифа",
  "Лимит учитывает размещения за период и одновременно активные объявления",
  "Неиспользованные размещения не переносятся в следующий период",
  "Одинаковые объявления запрещены",
  "Следующий период покупается вручную — автоматических списаний нет",
  "При повышении тарифа — доплата разницы цен, срок текущего периода сохраняется",
];
export type BillingSubscription = {
  periodId: string; tier: BillingTier | "intro"; limit: number; used: number;
  startsAt: number; endsAt: number; orderId: string; revoked?: boolean;
};
export type BillingOrderView = {
  id: string; catalog: BillingCatalog; tier: BillingTier; provider: "yookassa" | "apple";
  status: string; priceKopeks: number; productId: string; confirmationUrl: string; createdAt: number;
};
export type BillingState = {
  enabled: boolean; introEligible: boolean; freeRenewalAvailable: boolean;
  introClaimed: Partial<Record<BillingCatalog, boolean>>;
  subscriptions: Partial<Record<BillingCatalog, BillingSubscription>>;
  pending: BillingOrderView[]; yookassaReady: boolean; appleReady: boolean; appleExternalReady?: boolean;
};
export type BillingQuote = {
  catalog: BillingCatalog; tier: BillingTier; action: "purchase" | "upgrade";
  priceKopeks: number; oldTier: string; periodId: string; endsAt: number;
  productId: string;
};
export function appleProductId(catalog: BillingCatalog, tier: BillingTier, from?: BillingTier) {
  return `ru.strova.tariffs.${catalog}.${from ? `upgrade.${from}.` : ""}${tier}.v1`;
}
export const APPLE_BILLING_PRODUCTS = BILLING_CATALOGS.flatMap(catalog => {
  const plans = BILLING_PLANS.filter(p => p.catalog === catalog);
  return plans.flatMap((plan, i) => [
    { productId: appleProductId(catalog, plan.tier), catalog, tier: plan.tier, from: "", priceKopeks: plan.priceKopeks },
    ...plans.slice(0, i).map(previous => ({ productId: appleProductId(catalog, plan.tier, previous.tier), catalog, tier: plan.tier, from: previous.tier, priceKopeks: plan.priceKopeks - previous.priceKopeks })),
  ]);
});
export function billingQuote(catalog: BillingCatalog, tier: BillingTier, subscription?: BillingSubscription, now = Date.now()): BillingQuote {
  const target = getBillingPlan(catalog, tier);
  if (!target) throw new Error("Такого тарифа нет в выбранном каталоге");
  const active = subscription && !subscription.revoked && subscription.endsAt > now;
  if (active && subscription.tier !== "intro") {
    const current = getBillingPlan(catalog, subscription.tier);
    if (!current || target.priceKopeks <= current.priceKopeks) throw new Error("Тариф уже активен или ниже текущего. Выберите следующий период после его окончания");
    if (subscription.endsAt - now < 10 * 60_000) throw new Error("До конца периода осталось меньше 10 минут. Новый тариф можно приобрести после его окончания");
    return { catalog, tier, action: "upgrade", priceKopeks: target.priceKopeks - current.priceKopeks, oldTier: current.tier, periodId: subscription.periodId, endsAt: subscription.endsAt, productId: appleProductId(catalog, tier, current.tier) };
  }
  return { catalog, tier, action: "purchase", priceKopeks: target.priceKopeks, oldTier: active ? "intro" : "", periodId: active ? subscription.periodId : "", endsAt: now + BILLING_PERIOD_MS, productId: appleProductId(catalog, tier) };
}
