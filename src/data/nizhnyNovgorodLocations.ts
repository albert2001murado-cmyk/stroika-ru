// Единый список Нижегородской области для фильтров сайта и приложения.
export const NIZHNY_NOVGOROD_LOCATIONS = [
  "Нижний Новгород",
  "Арзамас",
  "Балахна",
  "Богородск",
  "Бор",
  "Ветлуга",
  "Володарск",
  "Ворсма",
  "Выкса",
  "Горбатов",
  "Городец",
  "Дзержинск",
  "Заволжье",
  "Княгинино",
  "Кстово",
  "Кулебаки",
  "Лукоянов",
  "Лысково",
  "Навашино",
  "Павлово",
  "Первомайск",
  "Перевоз",
  "Саров",
  "Семёнов",
  "Сергач",
  "Урень",
  "Чкаловск",
  "Шахунья",
  "Ардатов",
  "Большое Болдино",
  "Большое Мурашкино",
  "Бутурлино",
  "Вад",
  "Варнавино",
  "Вача",
  "Вознесенское",
  "Воскресенское",
  "Гагино",
  "Дальнее Константиново",
  "Дивеево",
  "Ковернино",
  "Красные Баки",
  "Пильна",
  "Починки",
  "Сеченово",
  "Сосновское",
  "Спасское",
  "Тонкино",
  "Тоншаево",
  "Шаранга",
  "Шатки",
  "Гидроторф",
  "Ильиногорск",
  "Решетиха",
  "Смолино",
  "Мулино",
  "Досчатое",
  "Виля",
  "Шиморское",
  "Сява",
  "Вахтан",
  "Ветлужский",
  "Сухобезводное",
] as const;

function normalizeLocation(value: unknown) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/(^|[^\p{L}\p{N}])(?:г|город|рп|рабочий поселок|поселок|пгт)\.?\s+/gu, "$1")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function locationMatchesFilter(
  locationValue: unknown,
  selectedValue: unknown
) {
  const selected = normalizeLocation(selectedValue);
  if (!selected) return true;

  const location = normalizeLocation(locationValue);
  if (!location) return false;

  // "Бор" must not match "Борисовка" or a street named "Соборная".
  return location === selected || location.startsWith(`${selected} `)
    || location.endsWith(` ${selected}`) || location.includes(` ${selected} `);
}

export function withNizhnyNovgorodLocations(
  values: Array<string | null | undefined> = []
) {
  const unique = new Map<string, string>();

  [...NIZHNY_NOVGOROD_LOCATIONS, ...values].forEach((value) => {
    const clean = String(value || "").trim();
    const key = normalizeLocation(clean);
    if (clean && key && !unique.has(key)) unique.set(key, clean);
  });

  const collator = new Intl.Collator("ru", {
    numeric: true,
    sensitivity: "base",
  });

  return [...unique.values()].sort((left, right) => {
    if (left === "Нижний Новгород") return -1;
    if (right === "Нижний Новгород") return 1;
    return collator.compare(left, right);
  });
}

