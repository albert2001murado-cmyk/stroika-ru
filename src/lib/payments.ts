export type PaymentChoice = "cash_or_transfer" | "bank_account";
export type BankDetails = {
  recipientName: string; inn: string; kpp: string; bankName: string;
  bik: string; accountNumber: string; correspondentAccount: string;
};
export const PAYMENT_OPTIONS: { value: PaymentChoice; label: string }[] = [
  { value: "bank_account", label: "Оплата на расчётный счёт" },
  { value: "cash_or_transfer", label: "Наличка или перевод" },
];
export const EMPTY_BANK_DETAILS: BankDetails = { recipientName: "", inn: "", kpp: "", bankName: "", bik: "", accountNumber: "", correspondentAccount: "" };
export function normalizePaymentChoice(methods: unknown): PaymentChoice {
  return Array.isArray(methods) && methods.includes("bank_account") ? "bank_account" : "cash_or_transfer";
}
export function paymentLabel(methods: unknown) {
  if (!Array.isArray(methods) || !methods.length) return "Оплата не указана";
  return PAYMENT_OPTIONS.find(option => option.value === normalizePaymentChoice(methods))!.label;
}
export function normalizeBankDetails(value: unknown): BankDetails {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(Object.keys(EMPTY_BANK_DETAILS).map(key => [key, String(source[key] || "").trim().slice(0, 250)])) as BankDetails;
}
export function bankDetailsFromProfile(profile: Record<string, any> | null | undefined): BankDetails {
  const saved = normalizeBankDetails(profile?.bankDetails);
  return { ...saved, recipientName: saved.recipientName || profile?.companyOfficialName || profile?.companyName || profile?.displayName || profile?.name || "",
    inn: saved.inn || profile?.companyInn || "", kpp: saved.kpp || profile?.companyKpp || "" };
}
export function validatePayment(methods: unknown, bankValue: unknown, accountType: unknown, confirmed: unknown): string | null {
  if (!Array.isArray(methods) || methods.length !== 1 || !PAYMENT_OPTIONS.some(option => option.value === methods[0])) return "Выберите один способ оплаты.";
  if (methods[0] !== "bank_account") return null;
  const bank = normalizeBankDetails(bankValue);
  if (bank.recipientName.length < 3) return "Укажите получателя платежа: название организации, ИП или ФИО.";
  if (bank.bankName.length < 2) return "Укажите название банка.";
  if (!/^\d{9}$/.test(bank.bik)) return "БИК должен содержать 9 цифр.";
  if (!/^\d{20}$/.test(bank.accountNumber)) return "Расчётный счёт должен содержать 20 цифр.";
  if (!/^\d{20}$/.test(bank.correspondentAccount)) return "Корреспондентский счёт должен содержать 20 цифр.";
  if (accountType === "ooo" && !/^\d{10}$/.test(bank.inn)) return "ИНН организации должен содержать 10 цифр.";
  if (accountType === "ip" && !/^\d{12}$/.test(bank.inn)) return "ИНН ИП должен содержать 12 цифр.";
  if (accountType === "ooo" && !/^\d{9}$/.test(bank.kpp)) return "КПП организации должен содержать 9 цифр.";
  if (confirmed !== true) return "Подтвердите, что реквизиты актуальны и принадлежат получателю.";
  return null;
}
export const BANK_FIELDS: { key: keyof BankDetails; label: string; numeric?: boolean; maxLength?: number }[] = [
  { key: "recipientName", label: "Получатель платежа", maxLength: 250 },
  { key: "inn", label: "ИНН", numeric: true, maxLength: 12 },
  { key: "kpp", label: "КПП (для ООО)", numeric: true, maxLength: 9 },
  { key: "bankName", label: "Название банка", maxLength: 250 },
  { key: "bik", label: "БИК банка", numeric: true, maxLength: 9 },
  { key: "accountNumber", label: "Расчётный счёт", numeric: true, maxLength: 20 },
  { key: "correspondentAccount", label: "Корреспондентский счёт", numeric: true, maxLength: 20 },
];
export function validateBankOwner(methods: unknown, bankValue: unknown, profile: Record<string, any> | null | undefined): string | null {
  if (normalizePaymentChoice(methods) !== "bank_account") return null;
  if (!profile) return "Не удалось загрузить данные получателя. Повторите попытку.";
  if (profile.accountType !== "ip" && profile.accountType !== "ooo") return null;
  if (!profile.companyInn) return "В профиле организации не указан ИНН. Сначала заполните данные организации.";
  if (normalizeBankDetails(bankValue).inn !== String(profile.companyInn).trim()) return "ИНН получателя должен совпадать с ИНН организации в вашем профиле.";
  return null;
}

export const BANK_DETAILS_MESSAGE_PREFIX = "Реквизиты для оплаты Стройка.ру";

export function formatBankDetailsMessage(value: unknown) {
  const bank = normalizeBankDetails(value);
  return [
    BANK_DETAILS_MESSAGE_PREFIX,
    `Получатель: ${bank.recipientName}`,
    `ИНН: ${bank.inn || "не указан"}`,
    ...(bank.kpp ? [`КПП: ${bank.kpp}`] : []),
    `Банк: ${bank.bankName}`,
    `БИК: ${bank.bik}`,
    `Расчётный счёт: ${bank.accountNumber}`,
    `Корреспондентский счёт: ${bank.correspondentAccount}`,
  ].join("\n");
}

export function isBankDetailsMessage(value: unknown) {
  return String(value || "").startsWith(BANK_DETAILS_MESSAGE_PREFIX);
}
