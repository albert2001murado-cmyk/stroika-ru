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
  { key: "window", roots: ["окн", "окон"] },
  { key: "door", roots: ["двер"] },
  { key: "plot", roots: ["участ", "двор", "территор"] },
  { key: "sand", roots: ["песок", "песк"] },
  { key: "gravel", roots: ["щебен", "щебн", "грави"] },
  { key: "concrete", roots: ["бетон", "стяжк"] },
  { key: "brick", roots: ["кирпич", "кладк"] },
  { key: "tile", roots: ["плитк", "кафел", "керамогран"] },
  { key: "drywall", roots: ["гипсокартон", "гкл"] },
  { key: "insulation", roots: ["утепл", "изоляц"] },
  { key: "foundation", roots: ["фундамент", "свайн"] },
  { key: "fence", roots: ["забор", "огражден", "ворот"] },
  { key: "roof", roots: ["крыш", "кровл"] },
  { key: "facade", roots: ["фасад"] },
  { key: "floor", roots: ["напольн", "покрыт", "ламинат", "линолеум", "паркет"] },
  { key: "plumbing", roots: ["сантех", "водоснаб", "канализац", "труб"] },
  { key: "electric", roots: ["электр", "проводк", "кабел"] },
  { key: "heating", roots: ["отоплен", "радиатор", "котел"] },
  { key: "ventilation", roots: ["вентиляц", "кондицион"] },
  { key: "furniture", roots: ["мебел", "шкаф", "кухн", "гарнитур"] },
  { key: "tool", roots: ["инструмент", "оборудован"] },
  { key: "excavator", roots: ["экскаватор", "землеройн"] },
  { key: "loader", roots: ["погрузчик", "погрузоч"] },
  { key: "crane", roots: ["автокран", "башенн", "манипулятор", "подъемник"] },
  { key: "warehouse", roots: ["склад"] },
  { key: "hangar", roots: ["ангар"] },
  { key: "welding", roots: ["сварк", "свароч"] },
  { key: "drilling", roots: ["бурен", "сверлен"] },
  { key: "excavation", roots: ["землян", "котлован", "транше"] },
  { key: "lay", roots: ["уклад", "уклады", "улож", "полож", "класть", "постел", "настел"], optionalWithSubject: true },
  { key: "install", roots: ["установ", "монтаж", "монтир", "смонтир", "подключ"], optionalWithSubject: true },
  { key: "provider", roots: ["мастер", "специалист", "исполнител", "работник", "бригад", "подрядчик"], optionalWithSubject: true },
  { key: "repair", roots: ["ремонт", "отремонт"] },
  { key: "rent", roots: ["аренд", "прокат", "напрокат"] },
  { key: "delivery", roots: ["достав", "привез", "привоз", "перевоз"] },
  { key: "build", roots: ["строител", "строит", "постро", "возвед"] },
  { key: "paint", roots: ["покрас", "окрас", "красит", "маляр"] },
  { key: "demolish", roots: ["демонтаж", "демонт", "снест", "снос"] },
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

export function matchesSearchKeywords(value: unknown, query: unknown) {
  const words = normalizeSearchKeywords(query)
    .split(" ")
    .filter((word) => word && !stopWords.has(word));
  if (!words.length) return true;

  const tokens = normalizeSearchKeywords(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => ({ word, root: searchTokenRoot(word), concept: concept(word)?.key }));
  if (!tokens.length) return false;

  const subjectWords = words.filter((word) => !auxiliaryAction(word));
  const required = subjectWords.length ? subjectWords : words;
  const wordMatches = (word: string) => {
    const meaning = concept(word)?.key;
    const root = searchTokenRoot(word);
    return tokens.some((token) => {
      if (token.word === word || (meaning && meaning === token.concept)) return true;
      if (word.length >= 3 && (token.word.startsWith(word) || word.startsWith(token.word))) return true;
      if (root.length >= 3 && (token.root === root || token.root.startsWith(root) || root.startsWith(token.root))) return true;
      return oneEditApart(root, token.root);
    });
  };

  return required.every(wordMatches);
}

export function publicationSearchText(item: Record<string, any>) {
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
    ...(Array.isArray(item.capabilities) ? item.capabilities : []),
    ...(Array.isArray(item.searchTags) ? item.searchTags : []),
    ...(Array.isArray(item.catalogPath) ? item.catalogPath : []),
  ]
    .filter((entry) => typeof entry === "string")
    .join(" ");
}
