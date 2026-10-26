/** Current catalog bindings. Rebinding a stored record never creates a copy. */
export type CatalogFields = {
  category?: unknown; subcategory?: unknown; catalogSection?: unknown;
  catalogCategoryId?: unknown; catalogCategoryTitle?: unknown; catalogGroupId?: unknown;
  catalogPath?: unknown;
};

export function catalogTextKey(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFKC").toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е").replace(/\bosb\b/gu, "осб")
    .replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/gu, " ").trim() : "";
}

type CatalogUpdate = {
  categoryId: string; category: string; current: string; previous: readonly string[];
  topics: string; shared?: boolean; fromCategoryId?: string; fromCategory?: string;
};

// previous is exclusively for existing records/bookmarks. Only current values
// are emitted by the category arrays and can appear as selectable directions.
export const CATALOG_UPDATES: readonly CatalogUpdate[] = [
  { categoryId: "windows", category: "Окна и двери", current: "Установка и замена окон",
    previous: ["Установка окон", "Замена окон", "Установка пластиковых окон", "Деревянные окна", "Алюминиевое остекление"],
    topics: "окно окна окон стеклопакет ПВХ пластиковые деревянные алюминиевые установка замена монтаж остекление", shared: true },
  { categoryId: "windows", category: "Окна и двери", current: "Установка дверей",
    previous: ["Входные двери", "Межкомнатные двери"],
    topics: "дверь двери дверей входные межкомнатные установка монтаж", shared: true },
  { categoryId: "windows", category: "Окна и двери", current: "Ремонт и регулировка окон",
    previous: ["Ремонт окон", "Регулировка окон"],
    topics: "окно окна окон ремонт регулировка отрегулировать настройка фурнитура петля ручка уплотнитель" },
  // This direction stays separate; сетки/сеток need the same search subject.
  { categoryId: "windows", category: "Окна и двери", current: "Установка москитных сеток",
    previous: [], topics: "москитная москитные сетка сетки сеток установка монтаж" },
  { categoryId: "engineering", category: "Инженерные системы", current: "Монтаж отопления",
    previous: ["Водяное отопление", "Электрическое отопление", "Тёплые стены"],
    topics: "отопление водяное электрическое теплые стены обогрев" },
  { categoryId: "engineering", category: "Инженерные системы", current: "Монтаж вентиляции",
    previous: ["Вентиляция", "Приточно-вытяжная система", "Монтаж рекуператора"],
    topics: "вентиляция приточная вытяжная приточно вытяжная система рекуператор воздуховод", shared: true },
  { categoryId: "engineering", category: "Инженерные системы", current: "Монтаж газопроводов",
    previous: ["Газопровод"], topics: "газопровод газовая труба трубы газ", shared: true },
  { categoryId: "engineering", category: "Инженерные системы", current: "Установка и обслуживание кондиционеров",
    previous: ["Кондиционеры"], topics: "кондиционер сплит система климат установка обслуживание", shared: true },
  { categoryId: "engineering", category: "Инженерные системы", current: "Монтаж и обслуживание чиллеров",
    previous: ["Чиллеры"], topics: "чиллер охлаждение установка обслуживание", shared: true },
  { categoryId: "engineering", category: "Инженерные системы", current: "Монтаж тепловых насосов",
    previous: ["Тепловые насосы"], topics: "тепловой насос отопление тепло", shared: true },
  { categoryId: "engineering", category: "Инженерные системы", current: "Монтаж тепловых пунктов",
    previous: ["Тепловые пункты"], topics: "тепловой пункт итп цтп теплоснабжение", shared: true },
  { categoryId: "roof", category: "Крыша и фасад", current: "Устройство фасада и сайдинг",
    previous: ["Устройство фасада", "Сайдинг", "Работы по установке сайдинга", "Облицовка фасада"],
    topics: "фасад сайдинг облицовка обшивка", shared: true },
  { categoryId: "roof", category: "Крыша и фасад", current: "Монтаж кровли",
    previous: ["Мягкая кровля", "Металлочерепица", "Фальцевая кровля", "Мембранная кровля", "Композитная черепица"],
    topics: "кровля крыша мягкая фальцевая мембранная металлочерепица композитная черепица", shared: true },
  { categoryId: "roof", category: "Крыша и фасад", current: "Монтаж и ремонт водостоков",
    previous: ["Монтаж водостоков", "Ремонт водостоков"], topics: "водосток желоб водосточная система" },
  { categoryId: "floors", category: "Полы", current: "Стяжка пола", previous: ["Полусухая стяжка"], topics: "стяжка пола полусухая" },
  { categoryId: "floors", category: "Полы", current: "Укладка ламината / кварц-винила (SPC)",
    previous: ["Укладка ламината", "Укладка SPC-ламината", "Укладка кварцвинила", "Укладка кварц-винила", "Укладка ламината / кварцвинила (SPC)"],
    topics: "ламинат кварцвинил кварц винил виниловый SPC СПС" },
  { categoryId: "floors", category: "Полы", current: "Укладка плитки / керамогранита",
    previous: ["Укладка плитки", "Укладка керамогранита"], topics: "плитка кафель керамогранит" },
  { categoryId: "floors", category: "Полы", current: "Полимерные полы", previous: ["Наливные полы"], topics: "полимерный пол", shared: true },
  { categoryId: "floors", category: "Полы", current: "Тёплый пол электрический", previous: ["Установка тёплого пола"],
    fromCategoryId: "electric", fromCategory: "Электрика", topics: "теплый электрический пол нагревательный кабель" },
  { categoryId: "plumbing", category: "Сантехника", current: "Установка фильтров и систем очистки воды",
    previous: ["Монтаж водоочистки", "Установка фильтров воды"], topics: "фильтр вода водоочистка очистка" },
  { categoryId: "plumbing", category: "Сантехника", current: "Монтаж и замена труб водоснабжения",
    previous: ["Монтаж водоснабжения", "Замена труб", "Разводка труб", "Замена стояков", "Монтаж стояков", "Монтаж водопровода"],
    topics: "водоснабжение водопровод труба труб стояк разводка замена" },
  { categoryId: "plumbing", category: "Сантехника", current: "Ремонт и обслуживание сантехники",
    previous: ["Ремонт протечек", "Обслуживание сантехники"], topics: "сантехника протечка течь ремонт обслуживание" },
  { categoryId: "plumbing", category: "Сантехника", current: "Монтаж сантехнического оборудования",
    previous: ["Установка унитаза", "Установка ванны", "Установка смесителя", "Установка бойлера", "Установка душевой кабины", "Установка раковины", "Установка полотенцесушителя", "Подключение стиральной машины", "Установка стиральной машины", "Подключение посудомоечной машины", "Установка посудомоечной машины"],
    topics: "унитаз ванна смеситель бойлер душевая кабина раковина полотенцесушитель стиральная машина посудомоечная машина" },
  { categoryId: "finishing", category: "Отделочные работы", current: "Штукатурные работы",
    previous: ["Штукатурка машинная", "Штукатурка ручная"], topics: "штукатурка штукатурить машинная ручная стены" },
  { categoryId: "finishing", category: "Отделочные работы", current: "Шпаклёвочные работы",
    previous: ["Шпаклёвка стен", "Механизированная шпаклёвка"], topics: "шпаклевка шпатлевка механизированная стены" },
  { categoryId: "finishing", category: "Отделочные работы", current: "Монтаж стеновых и 3D-панелей",
    previous: ["Монтаж стеновых панелей", "Монтаж 3D-панелей"], topics: "стеновые панели 3D 3д" },
  { categoryId: "finishing", category: "Отделочные работы", current: "Монтаж лепнины и молдингов",
    previous: ["Лепнина", "Монтаж молдингов"], topics: "лепнина молдинг", shared: true },
  { categoryId: "finishing", category: "Отделочные работы", current: "Монтаж гипсокартона",
    previous: ["Гипсокартон", "Монтаж ниш и арок", "Ниши и арки"], topics: "гипсокартон ГКЛ ниша арка", shared: true },
  { categoryId: "electric", category: "Электрика", current: "Монтаж и замена электропроводки",
    previous: ["Замена проводки", "Разводка электрики"], topics: "электрика электропроводка проводка кабель провод разводка замена" },
  { categoryId: "electric", category: "Электрика", current: "Монтаж электрооборудования",
    previous: ["Установка розеток", "Установка выключателей", "Монтаж электрощита", "Установка автоматов", "Монтаж освещения", "Подключение люстр", "Подключение электроплиты", "Установка зарядной станции"],
    topics: "розетка выключатель электрощит автомат освещение светильник люстра электроплита зарядная станция" },
  { categoryId: "electric", category: "Электрика", current: "Монтаж интернета и ТВ-сетей",
    previous: ["Монтаж слаботочных систем", "Слаботочные системы"], topics: "интернет ТВ телевидение слаботочные сети кабель" },
];

const updates = CATALOG_UPDATES.map(rule => ({ ...rule, key: catalogTextKey(rule.current),
  oldKeys: rule.previous.map(catalogTextKey), categoryKey: catalogTextKey(rule.category),
  sourceKey: catalogTextKey(rule.fromCategory || rule.category) }));
function string(value: unknown) { return typeof value === "string" ? value : ""; }

export function canonicalCatalogFields<T extends CatalogFields>(input: T) {
  const fields = { ...input, category: string(input.category), subcategory: string(input.subcategory),
    catalogSection: string(input.catalogSection), catalogCategoryId: string(input.catalogCategoryId),
    catalogCategoryTitle: string(input.catalogCategoryTitle), catalogGroupId: string(input.catalogGroupId) };
  const section = catalogTextKey(fields.catalogSection), category = catalogTextKey(fields.category);
  // A product with the same name (e.g. gypsum board) is never changed into a service.
  if (section && section !== "services" && section !== "услуги") return fields;
  if (/^(?:материалы|спецтехника|техника)$/u.test(category)) return fields;
  const key = catalogTextKey(fields.subcategory);
  const rule = updates.find(entry => {
    const sourceId = entry.fromCategoryId || entry.categoryId;
    const current = entry.key === key;
    if (!current && !entry.oldKeys.includes(key)) return false;
    const categoryMatches = category === (current ? entry.categoryKey : entry.sourceKey);
    const idMatches = fields.catalogCategoryId === (current ? entry.categoryId : sourceId);
    if (category && !categoryMatches) return false;
    if (fields.catalogCategoryId && !idMatches) return false;
    if (fields.catalogGroupId) return false; // Service categories have no material/equipment groups.
    return categoryMatches || idMatches || section === "services" || section === "услуги" || (!category && !fields.catalogCategoryId && !entry.shared);
  });
  if (!rule) return fields;
  return { ...fields, category: rule.category, subcategory: rule.current, catalogSection: "services",
    catalogCategoryId: rule.categoryId, catalogCategoryTitle: rule.category, catalogGroupId: "",
    ...(Array.isArray(input.catalogPath) ? { catalogPath: ["Услуги", rule.category, rule.current] } : {}) };
}

export function currentCatalogSubcategory(value: unknown, context: CatalogFields = {}): string {
  return canonicalCatalogFields({ ...context, subcategory: value }).subcategory;
}

export function catalogSubcategoryMatches(value: unknown, selected: unknown, context: CatalogFields = {}): boolean {
  return catalogTextKey(currentCatalogSubcategory(value, context)) === catalogTextKey(currentCatalogSubcategory(selected, context));
}

/** Physical subjects covered by a CURRENT merged direction, not old UI options. */
export function catalogSubjectText(value: unknown): string {
  const text = string(value), key = ` ${catalogTextKey(text)} `;
  const topics = updates.filter(entry => key.includes(` ${entry.key} `)).map(entry => entry.topics);
  return topics.length ? `${text} ${topics.join(" ")}` : text;
}
