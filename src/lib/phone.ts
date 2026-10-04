const RU_PHONE_DIGITS = 11;

function digitsOnly(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

export function normalizeRussianPhone(value: unknown): string {
  let digits = digitsOnly(value);
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.startsWith("8") && digits.length === RU_PHONE_DIGITS) {
    digits = `7${digits.slice(1)}`;
  }
  if (!digits.startsWith("7") || digits.length !== RU_PHONE_DIGITS) return "";
  return `+${digits}`;
}

export function formatRussianPhoneInput(value: unknown): string {
  let digits = digitsOnly(value);
  if (!digits) return "";
  if (digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  else if (!digits.startsWith("7")) digits = `7${digits}`;
  digits = digits.slice(0, RU_PHONE_DIGITS);
  const local = digits.slice(1);
  let result = "+7";
  if (local.length) result += ` (${local.slice(0, 3)}`;
  if (local.length >= 3) result += ")";
  if (local.length > 3) result += ` ${local.slice(3, 6)}`;
  if (local.length > 6) result += `-${local.slice(6, 8)}`;
  if (local.length > 8) result += `-${local.slice(8, 10)}`;
  return result;
}

export function russianPhoneError(value: unknown): string | null {
  if (!String(value || "").trim()) return "Укажите номер телефона.";
  if (!normalizeRussianPhone(value)) {
    return "Введите российский номер в формате +7 (999) 123-45-67.";
  }
  return null;
}

export function needsRussianPhoneUpdate(value: unknown) {
  const raw = String(value || "").trim();
  return Boolean(raw && (!raw.startsWith("+7") || !normalizeRussianPhone(raw)));
}
