import { contactAllowsCalls } from "./contactPreference";
import { normalizeRussianPhone } from "./phone";

export function callableProfilePhone(source: Record<string, unknown>): string {
  if (source.moderationStatus === "blocked" || !contactAllowsCalls(source.contactPreference)) {
    return "";
  }
  return normalizeRussianPhone(source.phone);
}
