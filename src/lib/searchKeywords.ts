/** Match the subject words of a natural-language query across publication fields. */
export function normalizeSearchKeywords(value: unknown) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("ru-RU")
    .replace(/\bosb\b/g, "осб").replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
const stopWords = new Set([
  "в", "во", "на", "с", "со", "и", "или", "по", "для", "из", "от", "до", "за", "к", "у", "под",
  "нужен", "нужна", "нужно", "нужны", "нужное", "нужные", "надо", "необходимо", "требуется", "требуются",
  "ищу", "ищем", "найти", "найдите", "купить", "куплю", "заказать", "закажу", "хочу", "хотим",
  "мне", "нам", "себе", "пожалуйста", "кто", "может", "можно", "сделать", "сделайте", "выполнить", "нуждается", "нуждаюсь",
]);
// These are explicit vocabulary aliases, not an unrestricted fuzzy/OR search.
const concepts: { key: string; roots: string[]; optionalWithSubject?: boolean }[] = [
  { key: "asphalt", roots: ["асфальт"] },
  { key: "window", roots: ["окн", "окон"] },
  { key: "plot", roots: ["участок", "участк"] },
  { key: "sand", roots: ["песок", "песк"] },
  { key: "gravel", roots: ["щебень", "щебн", "щебен"] },
  { key: "lay", roots: ["уклад", "уклады", "улож", "полож", "класть", "кладем", "кладет", "кладут", "покласть"], optionalWithSubject: true },
  { key: "install", roots: ["установ", "устанавли", "монтаж", "монтир", "смонтир"], optionalWithSubject: true },
  { key: "provider", roots: ["мастер", "специалист", "исполнител", "работник", "бригад"], optionalWithSubject: true },
  { key: "repair", roots: ["ремонт", "отремонт"] },
  { key: "rent", roots: ["аренд", "прокат", "напрокат"] },
  { key: "delivery", roots: ["достав", "привез", "привоз"] },
  { key: "build", roots: ["строительств", "постро", "строить", "строим", "возвед"] },
  { key: "paint", roots: ["покрас", "окрас", "красить"] },
  { key: "demolish", roots: ["демонтаж", "демонт", "снести", "снос"] },
  { key: "roof", roots: ["крыш", "кровл"] },
];
function concept(word: string) {
  return concepts.find(entry => entry.roots.some(root => word.startsWith(root)));
}
function auxiliaryAction(word: string) {
  const meaning = concept(word);
  if (meaning) return Boolean(meaning.optionalWithSubject);
  // Common task verbs may be absent from a seller's text. Match the object
  // instead, but only when the query contains another meaningful word.
  return /^(?:укат|зал|отсып|засып|выкоп|пролож|пробур|просверл|постел|настел|подключ|замен|помен|собра|разобра|убра|сня|поста).*(?:ть|ться)$/u.test(word);
}
function stem(word: string) {
  if (word.length < 4) return word;
  const result = word.replace(/(?:иями|ями|ами|ого|его|ому|ему|ыми|ими|иях|ах|ях|ам|ям|ов|ев|ом|ем|ый|ий|ая|яя|ое|ее|ые|ие|ой|ей|ую|юю|а|я|ы|и|у|ю|е)$/u, "");
  return result.length >= 3 ? result : word;
}
export function matchesSearchKeywords(value: unknown, query: unknown) {
  const words = normalizeSearchKeywords(query).split(" ").filter(word => word && !stopWords.has(word));
  if (!words.length) return true;
  const text = normalizeSearchKeywords(value);
  const tokens = text.split(/\s+/).filter(Boolean).map(word => ({ word, root: stem(word), concept: concept(word)?.key }));
  const subjectWords = words.filter(word => !auxiliaryAction(word));
  // “Положить асфальт” should also find “Асфальтирование”, without requiring
  // the seller to include the literal verb “положить”. Keep every subject term:
  // “асфальт Казань доставка” must still match asphalt, Kazan AND delivery.
  const required = subjectWords.length ? subjectWords : words;
  const wordMatches = (word: string) => {
    const meaning = concept(word)?.key;
    const root = stem(word);
    return tokens.some(token =>
      token.word === word || (meaning && meaning === token.concept) ||
      (word.length >= 3 && token.word.startsWith(word)) ||
      (root.length >= 3 && (token.root === root || token.root.startsWith(root)))
    );
  };

  return required.every(wordMatches);
}
export function publicationSearchText(item: Record<string, any>) {
  return [item.title, item.description, item.category, item.subcategory, item.catalogCategoryTitle,
    item.city, item.authorName, item.customerName, item.companyName, item.offerActionLabel, item.searchText,
    ...(Array.isArray(item.capabilities) ? item.capabilities : []),
    ...(Array.isArray(item.searchTags) ? item.searchTags : []), ...(Array.isArray(item.catalogPath) ? item.catalogPath : [])]
    .filter(value => typeof value === "string").join(" ");
}
