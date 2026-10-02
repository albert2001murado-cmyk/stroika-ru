/** All meaningful query words must be present, in any order and across fields. */
export function normalizeSearchKeywords(value: unknown) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("ru-RU")
    .replace(/\bosb\b/g, "осб").replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
const stopWords = new Set(["в", "во", "на", "с", "со", "и", "или", "по", "для", "из", "от", "до", "нужен", "нужна", "нужно", "нужны", "ищу", "купить", "заказать"]);
function stem(word: string) {
  if (/^(окна|окно|окнами|окнах|окон|окну|окном)$/.test(word)) return "окн";
  return word.length > 5 ? word.replace(/(?:иями|ами|ями|ого|ему|ыми|ими|ов|ев|ах|ях|ам|ям|ом|ем|ый|ий|ая|ое|ые|ой|ую|а|я|ы|и|у|ю|е)$/u, "") : word;
}
export function matchesSearchKeywords(value: unknown, query: unknown) {
  const words = normalizeSearchKeywords(query).split(" ").filter(word => word && !stopWords.has(word));
  if (!words.length) return true;
  const text = normalizeSearchKeywords(value);
  const tokens = text.split(" ");
  return words.every(word => text.includes(word) || (word.length >= 4 && tokens.some(token => {
    const left = stem(word), right = stem(token);
    return left.length >= 3 && right.length >= 3 && (left === right || right.startsWith(left));
  })));
}
export function publicationSearchText(item: Record<string, any>) {
  return [item.title, item.description, item.category, item.subcategory, item.catalogCategoryTitle,
    item.city, item.authorName, item.customerName, item.companyName, item.offerActionLabel, item.searchText,
    ...(Array.isArray(item.searchTags) ? item.searchTags : []), ...(Array.isArray(item.catalogPath) ? item.catalogPath : [])]
    .filter(value => typeof value === "string").join(" ");
}
