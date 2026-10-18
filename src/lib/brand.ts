/** Public identity. Firebase and release identifiers are deliberately separate. */
export const BRAND_NAME = "Строва.ру";
export const SITE_URL = "https://strovaru.ru";

// Accept previously shared invitations, but generate all new links on SITE_URL.
export const GROUP_INVITE_URL_PATTERN =
  /(?:^|[\s(])(?:(?:https?:\/\/)?(?:www\.)?(?:strovaru\.ru|stroika-ru\.ru))?\/join\/([a-f0-9]{32})(?=$|[\s/?#])/i;

/** Display-only migration for official notices; never rewrites user messages. */
export function serviceNotificationText(value: unknown, type?: string): string {
  const text = typeof value === "string" ? value : "";
  const official = type === "system" || type === "moderation" || type === "verification";
  const oldServiceName = /^(?:стройк[аи]\s*\.\s*ру|мастер[\s-]+строй)$/i.test(text.trim());
  if (!official && !oldServiceName) return text;
  return text.replace(/стройк[аи]\s*\.\s*ру|мастер[\s-]+строй/gi, BRAND_NAME);
}
