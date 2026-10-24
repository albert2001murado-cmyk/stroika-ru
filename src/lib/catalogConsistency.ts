import { canonicalCatalogFields, catalogSubjectText } from "../data/catalogUpdates";
import {
  CATALOG_FORM_SECTIONS,
  getCatalogFormCategories,
  type CatalogFormCategory,
  type CatalogSectionId,
} from "@/data/catalogForm";
import { normalizeCatalogText } from "./catalogSelection";

// Public API used by the creation/editing forms and CatalogConsistencyHint.
// Keep all fields optional: an unfinished form and older publications may
// supply only some catalog metadata. Firestore data is deliberately unknown.
export type CatalogConsistencyInput = {
  title?: unknown;
  description?: unknown;
  catalogSection?: unknown;
  catalogCategoryId?: unknown;
  catalogCategoryTitle?: unknown;
  catalogGroupId?: unknown;
  category?: unknown;
  subcategory?: unknown;
};

export type CatalogConsistencyIssue = {
  code: string;
  message: string;
};

const sections = CATALOG_FORM_SECTIONS.map((item) => item.id);
const sectionTitles: Record<CatalogSectionId, string> = {
  materials: "Материалы", services: "Услуги", equipment: "Техника",
  solutions: "Комплексные решения",
};
// Precompute once so the inline hint does not sort the entire catalog on
// every keystroke. These are the same options as the publication form.
const options = sections.flatMap((section) =>
  getCatalogFormCategories(section).map((category) => ({ section, ...category }))
);

const generic = /^(установ|устанавли|монтаж|монтир|ремонт|замен|продаж|продам|прода|покуп|куплю|достав|аренд|услуг|работ|материал|строител|обслуж|выполн|нуж|треб|ищ|мастер|заказ|качеств|профессион|недорог|новы|стары|подключ|устрой|изготов|производ|развод|комплекс|решен|полн|сво|наш|ваш|люб|готов|предлаг)/;

function terms(value: unknown): string[] {
  return [...new Set(normalizeCatalogText(value).split(" ")
    .filter((word) => (word.length >= 4 || word === "осб") && !generic.test(word))
    .map((word) => {
      if (/^(окн|окон|окош)/.test(word)) return "окно";
      if (/^двер/.test(word)) return "дверь";
      if (/^(обои|обоев|обоя)/.test(word)) return "обои";
      if (/^осб/.test(word)) return "осб";
      return word.slice(0, 5);
    }))];
}

const entries = options.flatMap((option) => option.subcategories.map((subcategory) => ({
  ...option, subcategory, tokens: terms(subcategory),
})));

function subjectMatch(content: string, label: string) {
  const normalized = normalizeCatalogText(content);
  const key = normalizeCatalogText(label);
  if (key && ` ${normalized} `.includes(` ${key} `)) return true;
  const labelTerms = terms(catalogSubjectText(label));
  return terms(content).some((word) => labelTerms.includes(word));
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, maximum = 180) {
  return typeof value === "string"
    ? value.normalize("NFKC").trim().slice(0, maximum)
    : "";
}

function normalize(value: unknown) {
  return text(value)
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function same(left: unknown, right: unknown) {
  const leftValue = normalize(left);
  return Boolean(leftValue) && leftValue === normalize(right);
}

function findSelectedOption(
  section: CatalogSectionId,
  data: Record<string, unknown>
): CatalogFormCategory | undefined {
  const sectionOptions = options.filter((option) => option.section === section);
  const categoryId = text(data.catalogCategoryId, 80);
  const groupId = text(data.catalogGroupId, 80);
  const category = text(data.category);
  const subcategory = text(data.subcategory);

  return (
    (groupId && sectionOptions.find((option) => option.groupId === groupId)) ||
    (categoryId && sectionOptions.find((option) => option.id === categoryId)) ||
    sectionOptions.find((option) =>
      option.subcategories.some((value) => same(value, subcategory))
    ) ||
    sectionOptions.find(
      (option) => same(option.category, category) || same(option.title, category)
    )
  );
}

/**
 * Rejects forged or stale catalog combinations before semantic moderation.
 * The publication must point to one of the paths that is currently visible in
 * the common site/app catalog.
 */
export function checkCatalogConsistency(
  value: unknown
): CatalogConsistencyIssue | null {
  const data = canonicalCatalogFields(object(value));
  const section = text(data.catalogSection, 32);
  const category = text(data.category);
  const subcategory = text(data.subcategory);

  // Incomplete/legacy form metadata is handled by required-field validation
  // and the server's normalizePublicationCatalog check, not a premature hint.
  if (!section || !subcategory) return null;

  const sectionDefinition = CATALOG_FORM_SECTIONS.find(
    (item) => item.id === section
  );
  if (!sectionDefinition) {
    return {
      code: "catalog-section-not-found",
      message:
        "Выбранный раздел больше не существует. Откройте каталог и выберите раздел заново.",
    };
  }

  const option = findSelectedOption(sectionDefinition.id, data);
  if (!option) {
    return {
      code: "catalog-category-not-found",
      message:
        "Выбранная категория отсутствует в каталоге. Выберите доступную категорию заново.",
    };
  }

  if (
    category &&
    !same(category, option.category) &&
    !same(category, option.title)
  ) {
    return {
      code: "catalog-category-conflict",
      message:
        "Категория и раздел объявления не совпадают. Выберите категорию заново, не изменяя её вручную.",
    };
  }

  const canonicalSubcategory = option.subcategories.find((item) =>
    same(item, subcategory)
  );
  if (!canonicalSubcategory) {
    return {
      code: "catalog-subcategory-not-found",
      message: `Подкатегория «${subcategory || "не указана"}» отсутствует в выбранной категории «${option.title}». Выберите один из доступных вариантов.`,
    };
  }

  const title = text(data.title, 240);
  const description = text(data.description, 5_000);
  if (title.length < 5) return null;
  const content = normalizeCatalogText(`${title} ${description}`);
  const install = /^(?:нужна? |требуется |ищу мастера для )?(?:установка|установку|установлю|устанавливаю|устанавливаем|монтаж|монтирую|монтируем|укладка|укладку|уложу|укладываю|поклейка|поклейку|поклею|ремонт)(?: |$)/.test(normalizeCatalogText(title));
  const sale = /^(?:продам|продаю|продажа|куплю|покупка) /.test(normalizeCatalogText(title));
  if ((sectionDefinition.id === "materials" && install && !/(?:с установкой|с монтажом|материал.{0,15}(?:монтаж|установ)|монтаж.{0,15}материал)/.test(content))
    || (sectionDefinition.id === "services" && sale && !/мебел/.test(normalizeCatalogText(option.title)))) {
    return { code: "catalog-section-mismatch", message: sectionDefinition.id === "materials"
      ? "В названии указана работа, а выбран каталог «Материалы». Для выполнения работ выберите «Услуги» или уточните, что продаёте материал с установкой."
      : "В названии указана покупка или продажа, а выбран каталог «Услуги». Выберите каталог товара или уточните услугу." };
  }

  function mismatch(value: string, field: string): CatalogConsistencyIssue | null {
    if (value.length < 5 || subjectMatch(value, canonicalSubcategory!)) return null;
    const contentTerms = terms(value);
    const categoryTerms = terms(option!.title);
    if (categoryTerms.length && categoryTerms.every((term) => contentTerms.includes(term))) return null;
    const matches = entries.filter((entry) => entry.tokens.length && entry.tokens.every((token) => contentTerms.includes(token)));
    if (subjectMatch(value, option!.title) && !matches.length) return null;
    if (!matches.length) return null;
    if (field === "Описание" && sectionDefinition!.id === "solutions" && subjectMatch(title, canonicalSubcategory!)) return null;
    const candidate = matches.find((entry) => entry.section === sectionDefinition!.id) || matches[0];
    if (!terms(canonicalSubcategory!).length) return null;
    return { code: "text-catalog-mismatch", message: `${field} не соответствует направлению «${canonicalSubcategory}». Проверьте текст. Если предложение относится к другому направлению, создайте объявление в подходящем разделе, например: ${sectionTitles[candidate.section]} → ${candidate.title} → ${candidate.subcategory}.` };
  }

  const titleIssue = mismatch(title, "Название");
  if (titleIssue) return titleIssue;
  const firstSentence = description.split(/[.!?\n]/)[0];
  if (/^(?:выполняем |предлагаю |предлагаем |нужна? |требуется )?(?:установ|монтаж|ремонт|уклад|поклей|продам|продажа|аренда)/.test(normalizeCatalogText(firstSentence))) {
    return mismatch(firstSentence, "Описание");
  }
  return null;
}

