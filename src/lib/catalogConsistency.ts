import { getCatalogFormCategories, type CatalogSectionId } from "@/data/catalogForm";
import { normalizeCatalogText } from "./catalogSelection";

export type CatalogConsistencyInput = {
  title?: unknown; description?: unknown; catalogSection?: unknown; catalogCategoryId?: unknown;
  catalogGroupId?: unknown; category?: unknown; subcategory?: unknown;
};
export type CatalogConsistencyIssue = { code: string; message: string };
const sections: CatalogSectionId[] = ["materials", "services", "equipment", "solutions"];
const sectionTitles = { materials: "Материалы", services: "Услуги", equipment: "Техника", solutions: "Комплексные решения" };
const options = sections.flatMap(section => getCatalogFormCategories(section).map(category => ({ section, ...category })));

// Generic action words cannot prove that e.g. window installation belongs to plumbing.
const generic = /^(установ|устанавли|монтаж|монтир|ремонт|замен|продаж|продам|прода|покуп|куплю|достав|аренд|услуг|работ|материал|строител|обслуж|выполн|нуж|треб|ищ|мастер|заказ|качеств|профессион|недорог|новы|стары|подключ|устрой|изготов|производ|развод|комплекс|решен|полн|сво|наш|ваш|люб|готов|предлаг)/;
function terms(value: unknown): string[] {
  return [...new Set(normalizeCatalogText(value).split(" ").filter(word => (word.length >= 4 || word === "осб") && !generic.test(word))
    .map(word => {
      if (/^(окн|окон|окош)/.test(word)) return "окно";
      if (/^двер/.test(word)) return "дверь";
      if (/^(обои|обоев|обоя)/.test(word)) return "обои";
      if (/^осб/.test(word)) return "осб";
      return word.slice(0, 5);
    }))];
}
const entries = options.flatMap(option => option.subcategories.map(subcategory => ({
  ...option, subcategory, tokens: terms(subcategory), label: normalizeCatalogText(subcategory),
})));
function intersection(a: string[], b: string[]) { return a.filter(word => b.includes(word)).length; }
function subjectMatch(text: string, label: string) {
  const normalized = normalizeCatalogText(text);
  const key = normalizeCatalogText(label);
  return Boolean(key && (` ${normalized} `).includes(` ${key} `)) || intersection(terms(text), terms(label)) > 0;
}

/** Fast conservative preflight, not a replacement for the server semantic/media classifier. */
export function checkCatalogConsistency(input: CatalogConsistencyInput): CatalogConsistencyIssue | null {
  const title = String(input.title || "").trim();
  const description = String(input.description || "").trim();
  const section = sections.find(value => value === input.catalogSection);
  const subcategory = normalizeCatalogText(input.subcategory);
  if (!section || !subcategory || title.length < 5) return null; // Required-field validation handles incomplete forms.
  const sectionOptions = options.filter(option => option.section === section);
  const explicit = sectionOptions.find(option => option.id === input.catalogCategoryId || Boolean(input.catalogGroupId && option.groupId === input.catalogGroupId));
  const selected = explicit || sectionOptions.find(option => option.subcategories.some(value => normalizeCatalogText(value) === subcategory));
  if (!selected || !selected.subcategories.some(value => normalizeCatalogText(value) === subcategory)) {
    return { code: "catalog-path-mismatch", message: "Подкатегория не относится к выбранному каталогу и категории. Выберите путь по каталогу заново." };
  }
  const selectedLabel = selected.subcategories.find(value => normalizeCatalogText(value) === subcategory)!;
  const selectedTitle = selected.title;
  const text = normalizeCatalogText(`${title} ${description}`);
  const install = /^(?:нужна? |требуется |ищу мастера для )?(?:установка|установку|установлю|устанавливаю|устанавливаем|монтаж|монтирую|монтируем|укладка|укладку|уложу|укладываю|поклейка|поклейку|поклею|ремонт)(?: |$)/.test(normalizeCatalogText(title));
  const sale = /^(?:продам|продаю|продажа|куплю|покупка) /.test(normalizeCatalogText(title));
  if ((section === "materials" && install && !/(?:с установкой|с монтажом|материал.{0,15}(?:монтаж|установ)|монтаж.{0,15}материал)/.test(text))
    || (section === "services" && sale && !/мебел/.test(normalizeCatalogText(selected.title)))) {
    return { code: "catalog-section-mismatch", message: section === "materials"
      ? "В названии указана работа, а выбран каталог «Материалы». Для выполнения работ выберите «Услуги» или уточните, что продаёте материал с установкой."
      : "В названии указана покупка или продажа, а выбран каталог «Услуги». Выберите каталог товара или уточните услугу." };
  }

  function mismatch(content: string, field: string): CatalogConsistencyIssue | null {
    if (content.length < 5) return null;
    if (subjectMatch(content, selectedLabel)) return null;
    const contentTerms = terms(content);
    const categoryTerms = terms(selectedTitle);
    if (categoryTerms.length && categoryTerms.every(term => contentTerms.includes(term))) return null;
    const matches = entries.filter(entry => entry.tokens.length && entry.tokens.every(token => contentTerms.includes(token)));
    // A broad category title (e.g. "Сантехника") is valid; it need not repeat the exact subcategory.
    if (subjectMatch(content, selectedTitle) && !matches.length) return null;
    if (!matches.length) return null; // Ambiguous wording goes through normal semantic moderation.
    // Complex solutions may legitimately include several trades in the description.
    if (field === "Описание" && section === "solutions" && subjectMatch(title, selectedLabel)) return null;
    const candidate = matches.find(entry => entry.section === section) || matches[0];
    // A selected label without a distinctive subject is left to the semantic classifier.
    if (!terms(selectedLabel).length) return null;
    return { code: "text-catalog-mismatch", message: `${field} не соответствует направлению «${selectedLabel}». Проверьте текст или выберите подходящий путь, например: ${sectionTitles[candidate.section]} → ${candidate.title} → ${candidate.subcategory}.` };
  }
  const titleIssue = mismatch(title, "Название");
  if (titleIssue) return titleIssue;
  // Check a clearly stated main service in the description; incidental words later in the text aren't grounds for rejection.
  const firstSentence = description.split(/[.!?\n]/)[0];
  if (/^(?:выполняем |предлагаю |предлагаем |нужна? |требуется )?(?:установ|монтаж|ремонт|уклад|поклей|продам|продажа|аренда)/.test(normalizeCatalogText(firstSentence))) {
    return mismatch(firstSentence, "Описание");
  }
  return null;
}
