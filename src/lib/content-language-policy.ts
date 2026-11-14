import languageRules from "../data/moderation-language.json";

const CYRILLIC_LOOKALIKE: Record<string, string> = languageRules.CYRILLIC_LOOKALIKE;
const LATIN_TRANSLITERATION: Record<string, string> = languageRules.LATIN_TRANSLITERATION;

function mapped(value: string, table: Record<string, string>) {
  return Array.from(value, (character) => table[character] ?? character).join("");
}

function profanityCandidates(value: unknown) {
  const prepared = (typeof value === "string" ? value.slice(0, 20_000) : "")
    .replace(/[йЙ]/g, "и")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[@]/g, "a").replace(/[$]/g, "s").replace(/!/g, "i");
  const tokens = prepared.match(/[a-zа-я0-9]+/giu) || [];
  const candidates = new Set(tokens);

  // Join deliberately split spelling: “б.л.я.д.ь”, “х у й”, “e 6 a t b”.
  for (let start = 0; start < tokens.length; start++) {
    if (tokens[start].length > 3) continue;
    let joined = "";
    for (let end = start; end < Math.min(tokens.length, start + 8); end++) {
      if (tokens[end].length > 3) break;
      joined += tokens[end];
      if (end > start && joined.length >= 3) candidates.add(joined);
    }
  }

  return Array.from(candidates).flatMap((candidate) => {
    const compact = candidate.replace(/(.)\1{2,}/gu, "$1$1");
    return [
      compact,
      compact.replace(/(.)\1+/gu, "$1"),
      mapped(compact, CYRILLIC_LOOKALIKE),
      mapped(compact, LATIN_TRANSLITERATION),
      mapped(compact, LATIN_TRANSLITERATION).replace(/(.)\1+/gu, "$1"),
      mapped(compact, CYRILLIC_LOOKALIKE).replace(/(.)\1+/gu, "$1"),
    ];
  });
}

const CYRILLIC_PROFANITY = languageRules.CYRILLIC_PROFANITY.map(pattern => new RegExp(pattern, "u"));
const LATIN_PROFANITY = languageRules.LATIN_PROFANITY.map(pattern => new RegExp(pattern, "u"));

/** Detects direct, transliterated, leetspeak and separator-obfuscated profanity. */
export function containsProhibitedLanguage(value: unknown) {
  return profanityCandidates(value).some((candidate) =>
    CYRILLIC_PROFANITY.some((pattern) => pattern.test(candidate)) ||
    LATIN_PROFANITY.some((pattern) => pattern.test(candidate))
  );
}

/** Explicit adult offers, not a blanket ban on numbers such as 18 or legitimate brands. */
export function containsExplicitAdultText(value: unknown) {
  const source = typeof value === "string" ? value.normalize("NFKC").toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g, "") : "";
  return languageRules.EXPLICIT_TEXT.some(pattern => new RegExp(pattern, "iu").test(source));
}
