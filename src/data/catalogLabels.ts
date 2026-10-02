/** Display alias; existing stored OSB categories remain valid and searchable. */
export function catalogLabel(value: unknown): string {
  return String(value || "").replace(/\bosb\b/gi, "ОСБ");
}
