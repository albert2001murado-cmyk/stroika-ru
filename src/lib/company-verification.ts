import type {
  AccountType,
  CompanyLookupResult,
  CompanyRegistryType,
} from "@/types";

export function normalizeInn(value: string): string {
  return value.replace(/\D/g, "");
}

export function expectedInnLength(accountType: AccountType): 10 | 12 | null {
  if (accountType === "ooo") return 10;
  if (accountType === "ip") return 12;
  return null;
}

export function expectedRegistryType(
  accountType: AccountType
): CompanyRegistryType | null {
  if (accountType === "ooo") return "LEGAL";
  if (accountType === "ip") return "INDIVIDUAL";
  return null;
}

function checksum(digits: number[], coefficients: number[]): number {
  const sum = coefficients.reduce(
    (total, coefficient, index) => total + coefficient * digits[index],
    0
  );
  return (sum % 11) % 10;
}

export function isValidRussianInn(value: string): boolean {
  const inn = normalizeInn(value);
  if (!/^\d{10}$|^\d{12}$/.test(inn)) return false;

  const digits = inn.split("").map(Number);

  if (digits.length === 10) {
    return (
      checksum(digits, [2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[9]
    );
  }

  const control11 = checksum(digits, [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]);
  const control12 = checksum(digits, [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]);
  return control11 === digits[10] && control12 === digits[11];
}

export function validateCompanyForAccount(
  company: CompanyLookupResult,
  accountType: AccountType
): void {
  const expectedLength = expectedInnLength(accountType);
  const expectedType = expectedRegistryType(accountType);

  if (!expectedLength || !expectedType) {
    throw new Error("Проверка организации доступна только для ИП и ООО.");
  }

  if (company.inn.length !== expectedLength) {
    throw new Error(
      accountType === "ip"
        ? "Для ИП нужен ИНН из 12 цифр."
        : "Для ООО нужен ИНН из 10 цифр."
    );
  }

  if (company.registryType !== expectedType) {
    throw new Error(
      accountType === "ip"
        ? "По этому ИНН найдено юридическое лицо, а не ИП."
        : "По этому ИНН найден ИП, а не ООО."
    );
  }

  if (company.registryStatus !== "ACTIVE") {
    throw new Error("Организация не является действующей.");
  }
}
