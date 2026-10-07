/**
 * Natural-language search shared by publication and catalog filters.
 *
 * The matcher is local and deterministic: it understands Russian word forms,
 * construction synonyms and a one-character typo, while preserving AND
 * semantics for meaningful words in a multi-word query.
 */
const SEARCH_CACHE_LIMIT = 2_048;
const normalizedSearchCache = new Map<string, string>();

function cacheSearchValue<T>(cache: Map<string, T>, key: string, value: T) {
  if (cache.size >= SEARCH_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, value);
  return value;
}

export function normalizeSearchKeywords(value: unknown) {
  const source = String(value || "");
  const cached = normalizedSearchCache.get(source);
  if (cached !== undefined) return cached;

  const normalized = source
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/(^|[^\p{L}\p{N}])3[\s-]*[дd](?=$|[^\p{L}\p{N}])/gu, "$13d")
    .replace(/\bosb\b/g, "осб")
    .replaceAll("ё", "е")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cacheSearchValue(normalizedSearchCache, source, normalized);
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
  /** A concrete subject must occur in the publication/catalog item itself. */
  primaryRequired?: boolean;
};

// Vocabulary aliases bridge different but equivalent wording. Morphological
// endings are handled separately by searchTokenRoot below.
const concepts: SearchConcept[] = [
  { key: "asphalt", roots: ["асфальт"], primaryRequired: true },
  { key: "paving", roots: ["брусчат", "тротуарн"], primaryRequired: true },
  { key: "window", roots: ["окн", "окон", "стеклопакет", "остеклен"], primaryRequired: true },
  { key: "door", roots: ["двер"], primaryRequired: true },
  { key: "plot", roots: ["участ", "двор", "территор", "благоустр", "ландшафт", "озелен", "газон"] },
  { key: "sand", roots: ["песок", "песк"], primaryRequired: true },
  { key: "crushed-stone", roots: ["щебен", "щебн"], primaryRequired: true },
  { key: "gravel", roots: ["грави"], primaryRequired: true },
  { key: "concrete", roots: ["бетон", "железобетон"], primaryRequired: true },
  { key: "cement", roots: ["цемент"], primaryRequired: true },
  { key: "mortar", roots: ["раствор"], primaryRequired: true },
  { key: "screed", roots: ["стяжк"], primaryRequired: true },
  { key: "brick", roots: ["кирпич"], primaryRequired: true },
  { key: "masonry", roots: ["кладк", "кладоч"], primaryRequired: true },
  { key: "aerated-block", roots: ["газобетон", "газоблок"], primaryRequired: true },
  { key: "foam-block", roots: ["пеноблок"], primaryRequired: true },
  { key: "glass-block", roots: ["стеклоблок"], primaryRequired: true },
  { key: "building-block", roots: ["строительнблок"], primaryRequired: true },
  { key: "tile", roots: ["плиточ", "плитк", "кафел"], primaryRequired: true },
  { key: "slab", roots: ["плит"], primaryRequired: true },
  { key: "ceramic", roots: ["керамич"], primaryRequired: true },
  { key: "porcelain-tile", roots: ["керамогран"], primaryRequired: true },
  { key: "mosaic", roots: ["мозаик"], primaryRequired: true },
  { key: "drywall", roots: ["гипсокартон", "гкл"], primaryRequired: true },
  { key: "insulation", roots: ["утепл", "изоляц", "теплоизоляц"] },
  { key: "mineral-wool", roots: ["минват"], primaryRequired: true },
  { key: "foam-insulation", roots: ["пенопласт", "пенополистирол"], primaryRequired: true },
  { key: "foundation", roots: ["фундамент"] },
  { key: "pile", roots: ["свайн"], primaryRequired: true },
  { key: "fence", roots: ["забор", "огражден"], primaryRequired: true },
  { key: "gate", roots: ["ворот"], primaryRequired: true },
  { key: "roof", roots: ["крыш", "кровл"] },
  { key: "roof-tile", roots: ["черепиц"], primaryRequired: true },
  { key: "profiled-sheet", roots: ["профнастил"], primaryRequired: true },
  { key: "slate", roots: ["шифер"], primaryRequired: true },
  { key: "roofing-felt", roots: ["рубероид"], primaryRequired: true },
  { key: "gutter", roots: ["водосток"], primaryRequired: true },
  { key: "snow-retainer", roots: ["снегозадерж", "снегодерж"], primaryRequired: true },
  { key: "facade", roots: ["фасад", "облицов"] },
  { key: "siding", roots: ["сайдинг"], primaryRequired: true },
  { key: "floor", roots: ["напольн", "покрыт", "наливнпол"] },
  { key: "laminate", roots: ["ламинат"], primaryRequired: true },
  { key: "linoleum", roots: ["линолеум"], primaryRequired: true },
  { key: "parquet", roots: ["паркет"], primaryRequired: true },
  { key: "ceiling", roots: ["потол"] },
  { key: "plaster", roots: ["штукатур", "выравнивстен"], primaryRequired: true },
  { key: "putty", roots: ["шпаклев", "шпатлев"], primaryRequired: true },
  { key: "wallpaper", roots: ["обои", "обойн", "поклей", "оклей"], primaryRequired: true },
  { key: "plumbing", roots: ["сантех", "водоснаб", "канализац"] },
  { key: "pipe", roots: ["труб"], primaryRequired: true },
  { key: "mixer", roots: ["смесител"], primaryRequired: true },
  { key: "toilet", roots: ["унитаз"], primaryRequired: true },
  { key: "sink", roots: ["раковин"], primaryRequired: true },
  { key: "electric", roots: ["электр"] },
  { key: "wiring", roots: ["проводк"], primaryRequired: true },
  { key: "cable", roots: ["кабел"], primaryRequired: true },
  { key: "socket", roots: ["розет"], primaryRequired: true },
  { key: "switch", roots: ["выключател"], primaryRequired: true },
  { key: "electric-panel", roots: ["электрощит"], primaryRequired: true },
  { key: "heating", roots: ["отоплен"] },
  { key: "radiator", roots: ["радиатор"], primaryRequired: true },
  { key: "boiler", roots: ["котел"], primaryRequired: true },
  { key: "ventilation", roots: ["вентиляц"] },
  { key: "conditioner", roots: ["кондицион"], primaryRequired: true },
  { key: "bath", roots: ["ванн"], primaryRequired: true },
  { key: "shower", roots: ["душев", "кабин"], primaryRequired: true },
  { key: "soundproof", roots: ["шумоизоляц", "звукоизоляц", "акустич"], primaryRequired: true },
  { key: "furniture", roots: ["мебел", "кухн"] },
  { key: "cabinet", roots: ["шкаф"], primaryRequired: true },
  { key: "furniture-suite", roots: ["гарнитур"], primaryRequired: true },
  { key: "countertop", roots: ["столешниц"], primaryRequired: true },
  { key: "wood", roots: ["пиломатериал", "дерев", "столяр", "плотниц"] },
  { key: "board", roots: ["доск"], primaryRequired: true },
  { key: "timber", roots: ["брус"], primaryRequired: true },
  { key: "plywood", roots: ["фанер"], primaryRequired: true },
  { key: "tool", roots: ["инструмент", "оборудован"] },
  { key: "excavator", roots: ["экскаватор"], primaryRequired: true },
  { key: "loader", roots: ["погрузчик", "погрузоч"], primaryRequired: true },
  { key: "roller", roots: ["каток", "катк", "виброкат"], primaryRequired: true },
  { key: "crane", roots: ["автокран", "башеннкран"], primaryRequired: true },
  { key: "manipulator", roots: ["манипулятор"], primaryRequired: true },
  { key: "lift", roots: ["подъемник"], primaryRequired: true },
  { key: "warehouse", roots: ["склад"], primaryRequired: true },
  { key: "hangar", roots: ["ангар"], primaryRequired: true },
  { key: "geodesy", roots: ["геодез", "межеван", "топограф", "кадастр"], primaryRequired: true },
  { key: "welding", roots: ["сварк", "свароч"], primaryRequired: true },
  { key: "metal-structures", roots: ["металлоконструкц"], primaryRequired: true },
  { key: "drilling", roots: ["бурен", "сверлен"], primaryRequired: true },
  { key: "excavation", roots: ["землян", "котлован", "транше"], primaryRequired: true },
  { key: "lay", roots: ["уклад", "уклады", "улож", "полож", "класть", "постел", "настел"], optionalWithSubject: true },
  { key: "install", roots: ["установ", "монтаж", "монтир", "смонтир", "подключ"], optionalWithSubject: true },
  { key: "provider", roots: ["мастер", "специалист", "исполнител", "работник", "бригад", "подрядчик"], optionalWithSubject: true },
  { key: "repair", roots: ["ремонт", "отремонт"] },
  { key: "rent", roots: ["аренд", "прокат", "напрокат"] },
  { key: "delivery", roots: ["достав", "привез", "привоз", "перевоз"] },
  { key: "build", roots: ["строител", "строит", "постро", "возвед"] },
  { key: "paint", roots: ["покрас", "окрас", "красит", "маляр"] },
  { key: "paint-material", roots: ["краск"], primaryRequired: true },
  { key: "enamel", roots: ["эмал"], primaryRequired: true },
  { key: "primer", roots: ["грунтовк"], primaryRequired: true },
  { key: "demolish", roots: ["демонтаж", "демонт", "снест", "снос"] },
  { key: "waste", roots: ["мусор", "утилиз", "вывоз"] },
  { key: "design", roots: ["дизайн", "проект"] },
  { key: "turnkey", roots: ["ключ", "комплексн"] },
];

function concept(word: string) {
  if (/^пол(?:ы|а|у|ом|ах|ов)?$/u.test(word)) return concepts.find((entry) => entry.key === "floor");
  if (/^сва(?:я|и|ю|е|ей|й|ям|ями|ях)$/u.test(word)) return concepts.find((entry) => entry.key === "pile");
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
  "грунтовк",
  "ванн",
  "душев",
  "кабин",
  "шумоизоляц",
  "звукоизоляц",
  "акустич",
  "стеклоблок",
  "снегозадерж",
  "снегодерж",
  "труб",
  "кабел",
  "смесител",
  "унитаз",
  "раковин",
  "радиатор",
  "котел",
  "ламинат",
  "линолеум",
  "паркет",
  "пиломатериал",
  "доск",
  "брус",
  "фанер",
  "цемент",
  "бетон",
  "раствор",
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

  const markedAsMaterial =
    value.includes("разделматериалы") || /(?:^| )материалы(?: |$)/u.test(value);
  const markedAsService =
    value.includes("разделуслуги") ||
    value.includes("разделрешения") ||
    /(?:^| )услуги(?: |$)/u.test(value) ||
    value.includes("комплексные решения");
  const markedAsEquipment =
    value.includes("разделтехника") || /(?:^| )техника(?: |$)/u.test(value);

  if (markedAsMaterial || markedAsService || markedAsEquipment) {
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
  primaryRequired?: boolean;
};

const searchTokensCache = new Map<string, SearchToken[]>();

function searchTokens(value: unknown): SearchToken[] {
  const normalized = normalizeSearchKeywords(value);
  const cached = searchTokensCache.get(normalized);
  if (cached) return cached;

  const tokens = normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const meaning = concept(word);
      return {
        word,
        root: searchTokenRoot(word),
        concept: meaning?.key,
        primaryRequired: meaning?.primaryRequired,
      };
    });

  return cacheSearchValue(searchTokensCache, normalized, tokens);
}

const queryRequirementsCache = new Map<string, SearchToken[]>();
const queryActionRequirementsCache = new Map<string, SearchToken[]>();

function queryActionRequirements(query: unknown): SearchToken[] {
  const normalized = normalizeSearchKeywords(query);
  const cached = queryActionRequirementsCache.get(normalized);
  if (cached) return cached;

  const unique = new Map<string, SearchToken>();
  for (const word of normalized.split(" ").filter(Boolean)) {
    const meaning = concept(word);
    if (!meaning?.optionalWithSubject || meaning.key === "provider") continue;
    const token = {
      word,
      root: searchTokenRoot(word),
      concept: meaning.key,
      primaryRequired: false,
    };
    if (!unique.has(meaning.key)) unique.set(meaning.key, token);
  }
  return cacheSearchValue(
    queryActionRequirementsCache,
    normalized,
    [...unique.values()]
  );
}

function queryRequirements(query: unknown): SearchToken[] {
  const normalized = normalizeSearchKeywords(query);
  const cached = queryRequirementsCache.get(normalized);
  if (cached) return cached;

  const words = normalized
    .split(" ")
    .filter((word) => word && !stopWords.has(word));
  if (!words.length) {
    return cacheSearchValue(queryRequirementsCache, normalized, []);
  }

  const subjectWords = words.filter((word) => !auxiliaryAction(word));
  const required = subjectWords.length ? subjectWords : words;
  const unique = new Map<string, SearchToken>();
  const ceramicSlabMeansTile = required.some(
    (word) => concept(word)?.key === "ceramic"
  );

  for (const word of required) {
    const detectedMeaning = concept(word);
    const meaning =
      ceramicSlabMeansTile && detectedMeaning?.key === "slab"
        ? concepts.find((entry) => entry.key === "tile")
        : detectedMeaning;
    const token = {
      word,
      root: searchTokenRoot(word),
      concept: meaning?.key,
      primaryRequired: meaning?.primaryRequired,
    };
    // Слова одного строительного смысла не должны искусственно сужать поиск:
    // «керамическая плита» — один предмет, а не два независимых требования.
    const key = token.concept ? `concept:${token.concept}` : `root:${token.root}`;
    if (!unique.has(key)) unique.set(key, token);
  }

  return cacheSearchValue(queryRequirementsCache, normalized, [...unique.values()]);
}

function tokenMatchScore(requirement: SearchToken, token: SearchToken) {
  if (token.word === requirement.word) return 140;
  if (requirement.concept && requirement.concept === token.concept) return 110;
  // Once a query word has an explicit domain meaning, do not let an unrelated
  // word with a shared prefix replace it ("грунтовка" is not "грунт").
  if (requirement.concept && requirement.concept !== token.concept) return 0;
  if (
    requirement.word.length >= 3 &&
    token.word.length >= 3 &&
    (token.word.startsWith(requirement.word) || requirement.word.startsWith(token.word))
  ) {
    return 90;
  }
  if (
    requirement.root.length >= 3 &&
    token.root.length >= 3 &&
    (token.root === requirement.root ||
      token.root.startsWith(requirement.root) ||
      requirement.root.startsWith(token.root))
  ) {
    return 75;
  }
  return oneEditApart(requirement.root, token.root) ? 35 : 0;
}

function requirementsScore(value: unknown, requirements: SearchToken[]) {
  if (!requirements.length) return 0;
  const tokens = searchTokens(value);
  if (!tokens.length) return -1;

  let score = 0;
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
  let score = normalizedValue.includes(normalizedQuery) ? 900 : 0;
  const matchedRequirementsScore = requirementsScore(value, requirements);
  if (matchedRequirementsScore < 0) return -1;
  score += matchedRequirementsScore;

  return score;
}

export function matchesSearchKeywords(value: unknown, query: unknown) {
  return searchRelevanceScore(value, query) >= 0;
}

/**
 * Catalog paths contain broad parent groups. A concrete query (for example,
 * “каток” or “погрузчик”) must therefore occur in the leaf title, otherwise a
 * neighbouring item from the same group would become a false result.
 */
export function catalogSearchRelevanceScore(
  primaryTitle: unknown,
  searchablePath: unknown,
  query: unknown
) {
  const primaryRequirements = queryRequirements(query).filter(
    (requirement) => requirement.primaryRequired
  );
  if (
    primaryRequirements.length &&
    requirementsScore(primaryTitle, primaryRequirements) < 0
  ) {
    return -1;
  }
  const relevance = searchRelevanceScore(searchablePath, query);
  if (relevance < 0) return -1;

  const actionRequirements = queryActionRequirements(query);
  const actionScore = requirementsScore(primaryTitle, actionRequirements);
  return relevance +
    (actionRequirements.length && actionScore >= 0 ? 2_000 + actionScore : 0);
}

function publicationSectionMarker(item: Record<string, any>) {
  const section = normalizeSearchKeywords(
    item.catalogSection || item.section || item.catalogType
  );
  return section.includes("material")
    ? "разделматериалы"
    : section.includes("service")
      ? "разделуслуги"
      : section.includes("solution") || section.includes("complex")
        ? "разделрешения"
        : section.includes("equipment") || section.includes("machinery")
          ? "разделтехника"
          : "";
}

const publicationIdentityCache = new WeakMap<object, string>();
const publicationPrimaryCache = new WeakMap<object, string>();
const publicationStructuredCache = new WeakMap<object, string>();
const publicationFullTextCache = new WeakMap<object, string>();

/**
 * Searchable identity of a publication. Unlike the full text, this deliberately
 * excludes description, author and generated search tags: a passing mention of
 * another machine or service must not change what the publication actually is.
 */
export function publicationSearchIdentityText(item: Record<string, any>) {
  const cached = publicationIdentityCache.get(item);
  if (cached !== undefined) return cached;

  const text = [
    item.title,
    item.name,
    item.category,
    item.subcategory,
    item.catalogCategoryTitle,
    item.catalogGroupTitle,
    item.offerActionLabel,
    publicationSectionMarker(item),
    ...(Array.isArray(item.catalogPath) ? item.catalogPath : []),
  ]
    .filter((entry) => typeof entry === "string")
    .join(" ");
  publicationIdentityCache.set(item, text);
  return text;
}

/** The concrete advertised object, without broad parent categories. */
export function publicationSearchPrimaryText(item: Record<string, any>) {
  const cached = publicationPrimaryCache.get(item);
  if (cached !== undefined) return cached;

  const catalogPath = Array.isArray(item.catalogPath) ? item.catalogPath : [];
  const leaf = catalogPath.length ? catalogPath[catalogPath.length - 1] : "";
  const text = [item.title, item.name, item.subcategory, leaf, item.offerActionLabel]
    .filter((entry) => typeof entry === "string")
    .join(" ");
  publicationPrimaryCache.set(item, text);
  return text;
}

/**
 * Structured fields that a user can intentionally search. Description and
 * generated tags are excluded so an incidental word cannot make an unrelated
 * publication eligible. Location and author fields remain searchable.
 */
export function publicationSearchStructuredText(item: Record<string, any>) {
  const cached = publicationStructuredCache.get(item);
  if (cached !== undefined) return cached;

  const text = [
    publicationSearchIdentityText(item),
    item.city,
    item.district,
    item.address,
    item.location?.address,
    item.authorName,
    item.customerName,
    item.userName,
    item.companyName,
    item.displayName,
  ]
    .filter((entry) => typeof entry === "string")
    .join(" ");
  publicationStructuredCache.set(item, text);
  return text;
}

/**
 * Relevance for an actual listing/request. The complete query must match a
 * deliberate structured field; description and generated tags can only add a
 * small ranking bonus after that gate. This prevents “каток” from returning a
 * loader (and the reverse) because of a passing mention in a long description.
 */
export function publicationSearchRelevanceScore(
  item: Record<string, any>,
  query: unknown
) {
  const normalizedQuery = normalizeSearchKeywords(query);
  if (!normalizedQuery) return 0;

  const primaryText = publicationSearchPrimaryText(item);
  const primaryRequirements = queryRequirements(query).filter(
    (requirement) => requirement.primaryRequired
  );
  const primaryRequirementsScore = requirementsScore(
    primaryText,
    primaryRequirements
  );
  if (primaryRequirements.length && primaryRequirementsScore < 0) return -1;

  const identityText = publicationSearchIdentityText(item);
  const actionRequirements = queryActionRequirements(query);
  const actionScore = requirementsScore(primaryText, actionRequirements);

  const structuredScore = searchRelevanceScore(
    publicationSearchStructuredText(item),
    query
  );
  if (structuredScore < 0) return -1;

  const fullScore = searchRelevanceScore(publicationSearchText(item), query);
  const identityScore = searchRelevanceScore(identityText, query);
  return (
    structuredScore +
    Math.max(0, primaryRequirementsScore) * 4 +
    (actionRequirements.length && actionScore >= 0 ? 2_000 + actionScore : 0) +
    (identityScore >= 0 ? 3_000 + identityScore * 2 : 0) +
    (fullScore >= 0 ? Math.min(fullScore, 1_500) / 10 : 0)
  );
}

export function matchesPublicationSearch(item: Record<string, any>, query: unknown) {
  return publicationSearchRelevanceScore(item, query) >= 0;
}

export function publicationSearchText(item: Record<string, any>) {
  const cached = publicationFullTextCache.get(item);
  if (cached !== undefined) return cached;

  const text = [
    publicationSearchStructuredText(item),
    item.description,
    item.searchText,
    ...(Array.isArray(item.capabilities) ? item.capabilities : []),
    ...(Array.isArray(item.searchTags) ? item.searchTags : []),
  ]
    .filter((entry) => typeof entry === "string")
    .join(" ");
  publicationFullTextCache.set(item, text);
  return text;
}
