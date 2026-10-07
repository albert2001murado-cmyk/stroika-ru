/**
 * Natural-language search shared by publication and catalog filters.
 *
 * The matcher is local and deterministic: it understands Russian word forms,
 * construction synonyms and a one-character typo, while preserving AND
 * semantics for meaningful words in a multi-word query.
 */
export function normalizeSearchKeywords(value: unknown) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/(^|[^\p{L}\p{N}])3[\s-]*[дd](?=$|[^\p{L}\p{N}])/gu, "$13d")
    .replace(/\bosb\b/g, "осб")
    .replaceAll("ё", "е")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const stopWords = new Set([
  "а", "без", "будет", "бы", "вам", "вас", "весь", "вместе", "внутри", "во", "возле", "все", "всю", "вся",
  "где", "да", "давайте", "для", "до", "его", "ее", "еще", "за", "здесь", "и", "из", "или", "им", "их",
  "как", "какая", "какие", "какой", "когда", "кто", "ли", "мне", "может", "можно", "мой", "мы", "на", "над",
  "нам", "наш", "не", "него", "нее", "необходимо", "ни", "но", "нужен", "нужна", "нужно", "нужны", "нужное",
  "нужные", "об", "около", "он", "она", "они", "от", "по", "под", "пожалуйста", "при", "про", "рядом", "с",
  "работа", "работы", "работу", "работ", "сам", "сама", "себе", "со", "там", "тебе", "только", "требуется", "требуются", "у", "хочу", "хотим", "чтобы",
  "это", "этот", "эту", "я", "ищу", "ищем", "найти", "найдите", "купить", "куплю", "заказать", "закажу",
  "сделать", "сделайте", "выполнить", "нуждается", "нуждаюсь",
]);

type SearchConcept = {
  key: string;
  roots: string[];
  optionalWithSubject?: boolean;
};

// Vocabulary aliases bridge different but equivalent wording. Morphological
// endings are handled separately by searchTokenRoot below.
const concepts: SearchConcept[] = [
  { key: "asphalt", roots: ["асфальт"] },
  { key: "paving", roots: ["брусчат", "тротуарн"] },
  { key: "window", roots: ["окн", "окон", "стеклопакет", "остеклен"] },
  { key: "door", roots: ["двер"] },
  { key: "plot", roots: ["участ", "двор", "территор", "благоустр", "ландшафт", "озелен", "газон"] },
  { key: "sand", roots: ["песок", "песк"] },
  { key: "gravel", roots: ["щебен", "щебн", "грави"] },
  { key: "concrete", roots: ["бетон", "цемент", "раствор", "железобетон", "стяжк"] },
  { key: "brick", roots: ["кирпич", "кладк", "кладоч", "газобетон", "пеноблок", "строительнблок"] },
  // Названия материала объединены в один смысл; намерение «купить» или
  // «уложить» обрабатывается отдельно и не смешивает товар с работой.
  { key: "tile", roots: ["плит", "плиточ", "кафел", "керамич", "керамогран", "мозаик"] },
  { key: "drywall", roots: ["гипсокартон", "гкл", "гипсов"] },
  { key: "insulation", roots: ["утепл", "изоляц", "минват", "пенопласт", "пенополистирол", "теплоизоляц"] },
  { key: "foundation", roots: ["фундамент", "свайн"] },
  { key: "fence", roots: ["забор", "огражден", "ворот"] },
  { key: "roof", roots: ["крыш", "кровл", "черепиц", "профнастил", "шифер", "рубероид", "водосток"] },
  { key: "facade", roots: ["фасад", "сайдинг", "облицов"] },
  { key: "floor", roots: ["напольн", "покрыт", "ламинат", "линолеум", "паркет", "наливнпол"] },
  { key: "ceiling", roots: ["потол"] },
  { key: "plaster", roots: ["штукатур", "шпаклев", "шпатлев", "выравнивстен"] },
  { key: "wallpaper", roots: ["обои", "обойн", "поклей", "оклей"] },
  { key: "plumbing", roots: ["сантех", "водоснаб", "канализац", "труб", "смесител", "унитаз", "раковин"] },
  { key: "electric", roots: ["электр", "проводк", "кабел", "розет", "выключател", "электрощит"] },
  { key: "heating", roots: ["отоплен", "радиатор", "котел"] },
  { key: "ventilation", roots: ["вентиляц", "кондицион"] },
  { key: "furniture", roots: ["мебел", "шкаф", "кухн", "гарнитур", "столешниц"] },
  { key: "wood", roots: ["пиломатериал", "доск", "брус", "фанер", "дерев", "столяр", "плотниц"] },
  { key: "tool", roots: ["инструмент", "оборудован"] },
  { key: "excavator", roots: ["экскаватор", "землеройн"] },
  { key: "loader", roots: ["погрузчик", "погрузоч"] },
  { key: "crane", roots: ["автокран", "башенн", "манипулятор", "подъемник"] },
  { key: "warehouse", roots: ["склад"] },
  { key: "hangar", roots: ["ангар"] },
  { key: "welding", roots: ["сварк", "свароч", "металлоконструкц"] },
  { key: "drilling", roots: ["бурен", "сверлен"] },
  { key: "excavation", roots: ["землян", "котлован", "транше"] },
  { key: "lay", roots: ["уклад", "уклады", "улож", "полож", "класть", "постел", "настел"], optionalWithSubject: true },
  { key: "install", roots: ["установ", "монтаж", "монтир", "смонтир", "подключ"], optionalWithSubject: true },
  { key: "provider", roots: ["мастер", "специалист", "исполнител", "работник", "бригад", "подрядчик"], optionalWithSubject: true },
  { key: "repair", roots: ["ремонт", "отремонт"] },
  { key: "rent", roots: ["аренд", "прокат", "напрокат"] },
  { key: "delivery", roots: ["достав", "привез", "привоз", "перевоз"] },
  { key: "build", roots: ["строител", "строит", "постро", "возвед"] },
  { key: "paint", roots: ["покрас", "окрас", "красит", "маляр", "краск", "эмал", "грунтов"] },
  { key: "demolish", roots: ["демонтаж", "демонт", "снест", "снос"] },
  { key: "waste", roots: ["мусор", "утилиз", "вывоз"] },
  { key: "design", roots: ["дизайн", "проект"] },
  { key: "turnkey", roots: ["ключ", "комплексн"] },
];

function concept(word: string) {
  if (/^пол(?:ы|а|у|ом|ах|ов)?$/u.test(word)) return concepts.find((entry) => entry.key === "floor");
  if (/^сва(?:я|и|ю|ей|ями|ях)$/u.test(word)) return concepts.find((entry) => entry.key === "foundation");
  return concepts.find((entry) => entry.roots.some((root) => word.startsWith(root)));
}

function auxiliaryAction(word: string) {
  const meaning = concept(word);
  if (meaning) return Boolean(meaning.optionalWithSubject);
  // These verbs describe an action, while the searchable object normally sits
  // in another word: “залить фундамент”, “заменить проводку”, etc.
  return /^(?:укат|зал|отсып|засып|выкоп|пролож|пробур|просверл|постел|настел|подключ|замен|помен|собра|разобра|убра|сня|постав|сдел|выполн|заказ|куп|найд|ищ).*/u.test(word);
}

type SearchIntent = "material" | "service" | "any";

const MATERIAL_PRODUCT_ROOTS = [
  "керамич",
  "плит",
  "кафел",
  "керамогран",
  "мозаик",
  "песок",
  "песк",
  "щеб",
  "грави",
  "кирпич",
  "газобетон",
  "пеноблок",
  "гипсокартон",
  "гкл",
  "осб",
  "пен",
  "минват",
  "пенопласт",
  "утеплител",
  "краск",
  "эмал",
  "грунтов",
  "ламинат",
  "линолеум",
  "паркет",
  "пиломатериал",
  "доск",
  "брус",
  "фанер",
  "цемент",
  "бетон",
] as const;

function querySearchIntent(query: unknown): SearchIntent {
  const value = normalizeSearchKeywords(query);
  if (!value) return "any";

  if (
    /(?:^| )(?:купить|куплю|покупка|продажа|продам|материал(?:ы|ов|ами)?|товар(?:ы|ов)?|поставка)(?: |$)/u.test(
      value
    )
  ) {
    return "material";
  }

  if (
    /(?:^| )(?:работа|работы|работу|услуга|услуги|мастер|мастера|исполнитель|бригада|подрядчик|укладка|укладывать|уложить|положить|постелить|настелить|монтаж|монтировать|смонтировать|установка|установить|ремонт|отремонтировать|строительство|построить|возведение|покраска|окраска|покрасить|штукатурка|шпаклевка|кладка|сборка|собрать|залить|отсыпать|засыпать|укатать|бетонирование|асфальтирование)(?: |$)/u.test(
      value
    )
  ) {
    return "service";
  }

  if (
    value
      .split(" ")
      .some((word) => MATERIAL_PRODUCT_ROOTS.some((root) => word.startsWith(root)))
  ) {
    return "material";
  }

  return "any";
}

function valueMatchesIntent(value: string, intent: SearchIntent) {
  if (intent === "any") return true;

  const markedAsMaterial = value.includes("разделматериалы");
  const markedAsService =
    value.includes("разделуслуги") || value.includes("разделрешения");

  if (markedAsMaterial || markedAsService) {
    return intent === "material" ? markedAsMaterial : markedAsService;
  }

  const looksLikeMaterial =
    /(?:^| )(?:материал(?:ы|ов|ами)?|товар(?:ы|ов)?|продажа|продам|поставка)(?: |$)/u.test(
      value
    ) ||
    value
      .split(" ")
      .some((word) => MATERIAL_PRODUCT_ROOTS.some((root) => word.startsWith(root)));
  const looksLikeService =
    /(?:^| )(?:услуга|услуги|работа|работы|мастер|бригада|подрядчик|укладка|настил|монтаж|установка|ремонт|строительство|возведение|покраска|окраска|штукатурка|шпаклевка|кладка|сборка|отсыпка|засыпка|укатка|бетонирование|асфальтирование)(?: |$)/u.test(
      value
    );

  return intent === "material"
    ? looksLikeMaterial && !looksLikeService
    : looksLikeService;
}

function removeFirstMatchingSuffix(value: string, suffixes: readonly string[]) {
  for (const suffix of suffixes) {
    if (value.endsWith(suffix)) return value.slice(0, -suffix.length);
  }
  return value;
}

const PERFECTIVE_1 = ["ившись", "ывшись", "ивши", "ывши", "ив", "ыв"] as const;
const PERFECTIVE_2 = ["вшись", "вши", "в"] as const;
const REFLEXIVE = ["ся", "сь"] as const;
const ADJECTIVE = ["ими", "ыми", "его", "ого", "ему", "ому", "ее", "ие", "ые", "ое", "ей", "ий", "ый", "ой", "ем", "им", "ым", "ом", "их", "ых", "ую", "юю", "ая", "яя", "ою", "ею"] as const;
const PARTICIPLE_1 = ["ем", "нн", "вш", "ющ", "щ"] as const;
const PARTICIPLE_2 = ["ивш", "ывш", "ующ"] as const;
const VERB_1 = ["ила", "ыла", "ена", "ейте", "уйте", "ите", "или", "ыли", "ей", "уй", "ил", "ыл", "им", "ым", "ен", "ило", "ыло", "ено", "ят", "ует", "уют", "ит", "ыт", "ены", "ить", "ыть", "ишь", "ую", "ю"] as const;
const VERB_2 = ["ла", "на", "ете", "йте", "ли", "й", "л", "ем", "н", "ло", "но", "ет", "ны", "ть", "ешь", "нно"] as const;
const NOUN = ["иями", "ями", "ами", "ией", "иям", "ием", "иях", "ев", "ов", "ие", "ье", "еи", "ии", "ей", "ой", "ий", "ям", "ем", "ам", "ом", "о", "у", "ах", "ях", "ы", "ь", "ию", "ью", "ю", "ия", "ья", "я", "а", "евы", "овы", "е", "и"] as const;

/** A compact implementation of the Russian Porter/Snowball stemmer. */
export function searchTokenRoot(wordValue: unknown) {
  const word = normalizeSearchKeywords(wordValue);
  if (!word || word.includes(" ") || !/^[а-я]+$/u.test(word) || word.length < 4) return word;

  const firstVowel = word.search(/[аеиоуыэюя]/u);
  if (firstVowel < 0 || firstVowel === word.length - 1) return word;
  const prefix = word.slice(0, firstVowel + 1);
  let rv = word.slice(firstVowel + 1);

  let next = removeFirstMatchingSuffix(rv, PERFECTIVE_1);
  if (next === rv) {
    for (const suffix of PERFECTIVE_2) {
      if (!rv.endsWith(suffix)) continue;
      const before = rv.slice(0, -suffix.length);
      if (/[ая]$/u.test(before)) next = before;
      break;
    }
  }

  if (next !== rv) {
    rv = next;
  } else {
    rv = removeFirstMatchingSuffix(rv, REFLEXIVE);
    const adjective = removeFirstMatchingSuffix(rv, ADJECTIVE);
    if (adjective !== rv) {
      rv = adjective;
      const participle = removeFirstMatchingSuffix(rv, PARTICIPLE_1);
      if (participle !== rv && /[ая]$/u.test(participle)) rv = participle;
      else rv = removeFirstMatchingSuffix(rv, PARTICIPLE_2);
    } else {
      const verb1 = removeFirstMatchingSuffix(rv, VERB_1);
      if (verb1 !== rv) rv = verb1;
      else {
        let verb2 = rv;
        for (const suffix of VERB_2) {
          if (!rv.endsWith(suffix)) continue;
          const before = rv.slice(0, -suffix.length);
          if (/[ая]$/u.test(before)) verb2 = before;
          break;
        }
        rv = verb2 !== rv ? verb2 : removeFirstMatchingSuffix(rv, NOUN);
      }
    }
  }

  rv = rv.replace(/и$/u, "");
  if (/ость?$/u.test(rv)) rv = rv.replace(/ость?$/u, "");
  if (/ейше$/u.test(rv)) rv = rv.replace(/ейше$/u, "");
  if (/нн$/u.test(rv)) rv = rv.slice(0, -1);
  else rv = rv.replace(/ь$/u, "");

  const result = prefix + rv;
  return result.length >= 3 ? result : word;
}

function oneEditApart(left: string, right: string) {
  if (left === right) return true;
  if (left.length < 5 || right.length < 5 || Math.abs(left.length - right.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (left.length > right.length) i++;
    else if (right.length > left.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (i < left.length || j < right.length ? 1 : 0) <= 1;
}

type SearchToken = {
  word: string;
  root: string;
  concept?: string;
};

function searchTokens(value: unknown): SearchToken[] {
  return normalizeSearchKeywords(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => ({ word, root: searchTokenRoot(word), concept: concept(word)?.key }));
}

function queryRequirements(query: unknown): SearchToken[] {
  const words = normalizeSearchKeywords(query)
    .split(" ")
    .filter((word) => word && !stopWords.has(word));
  if (!words.length) return [];

  const subjectWords = words.filter((word) => !auxiliaryAction(word));
  const required = subjectWords.length ? subjectWords : words;
  const unique = new Map<string, SearchToken>();

  for (const word of required) {
    const token = {
      word,
      root: searchTokenRoot(word),
      concept: concept(word)?.key,
    };
    // Слова одного строительного смысла не должны искусственно сужать поиск:
    // «керамическая плита» — один предмет, а не два независимых требования.
    const key = token.concept ? `concept:${token.concept}` : `root:${token.root}`;
    if (!unique.has(key)) unique.set(key, token);
  }

  return [...unique.values()];
}

function tokenMatchScore(requirement: SearchToken, token: SearchToken) {
  if (token.word === requirement.word) return 140;
  if (requirement.concept && requirement.concept === token.concept) return 110;
  if (
    requirement.word.length >= 3 &&
    (token.word.startsWith(requirement.word) || requirement.word.startsWith(token.word))
  ) {
    return 90;
  }
  if (
    requirement.root.length >= 3 &&
    (token.root === requirement.root ||
      token.root.startsWith(requirement.root) ||
      requirement.root.startsWith(token.root))
  ) {
    return 75;
  }
  return oneEditApart(requirement.root, token.root) ? 35 : 0;
}

/**
 * Higher values mean a closer result. `-1` means that at least one meaningful
 * part of the query is absent. This keeps multi-word search precise while
 * allowing material/service synonyms to meet the same requirement.
 */
export function searchRelevanceScore(value: unknown, query: unknown) {
  const normalizedQuery = normalizeSearchKeywords(query);
  const requirements = queryRequirements(query);
  if (!requirements.length) return 0;

  const normalizedValue = normalizeSearchKeywords(value);
  if (!valueMatchesIntent(normalizedValue, querySearchIntent(query))) return -1;
  const tokens = searchTokens(value);
  if (!tokens.length) return -1;

  let score = normalizedValue.includes(normalizedQuery) ? 900 : 0;
  for (const requirement of requirements) {
    const best = tokens.reduce(
      (current, token) => Math.max(current, tokenMatchScore(requirement, token)),
      0
    );
    if (!best) return -1;
    score += best;
  }

  return score;
}

export function matchesSearchKeywords(value: unknown, query: unknown) {
  return searchRelevanceScore(value, query) >= 0;
}

export function publicationSearchText(item: Record<string, any>) {
  const section = normalizeSearchKeywords(
    item.catalogSection || item.section || item.catalogType
  );
  const sectionMarker = section.includes("material")
    ? "разделматериалы"
    : section.includes("service")
      ? "разделуслуги"
      : section.includes("solution") || section.includes("complex")
        ? "разделрешения"
        : section.includes("equipment") || section.includes("machinery")
          ? "разделтехника"
          : "";

  return [
    item.title,
    item.description,
    item.category,
    item.subcategory,
    item.catalogCategoryTitle,
    item.city,
    item.authorName,
    item.customerName,
    item.companyName,
    item.offerActionLabel,
    item.searchText,
    sectionMarker,
    ...(Array.isArray(item.capabilities) ? item.capabilities : []),
    ...(Array.isArray(item.searchTags) ? item.searchTags : []),
    ...(Array.isArray(item.catalogPath) ? item.catalogPath : []),
  ]
    .filter((entry) => typeof entry === "string")
    .join(" ");
}
