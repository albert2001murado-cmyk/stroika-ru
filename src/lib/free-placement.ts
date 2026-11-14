export const FREE_CATALOGS = ["materials", "services", "equipment", "solutions"] as const;
export type FreeCatalog = (typeof FREE_CATALOGS)[number];
export const FREE_LIMIT = 3;
export const FREE_CATALOG_INFO = {
  materials: { title: "Материалы", detail: "Кирпич, смеси и всё для стройки" },
  services: { title: "Услуги", detail: "Работы и специалисты" },
  equipment: { title: "Спецтехника", detail: "Аренда и услуги техники" },
  solutions: { title: "Комплексные решения", detail: "Проекты и работы под ключ" },
} as const;
export type FreePlacementState = Record<FreeCatalog, { active: boolean; remaining: number }>;
export const isFreeCatalog = (value: unknown): value is FreeCatalog => FREE_CATALOGS.includes(value as FreeCatalog);
export const canRenewFree = (publication: unknown) => {
  const count = Number((publication as { renewalCount?: number } | null)?.renewalCount ?? 0);
  return Number.isFinite(count) && count === 0;
};
