import "server-only";

import type { AccountType, CompanyLookupResult } from "@/types";
import {
  isValidRussianInn,
  normalizeInn,
  validateCompanyForAccount,
} from "@/lib/company-verification";

type DaDataSuggestion = {
  value?: string;
  unrestricted_value?: string;
  data?: {
    inn?: string;
    kpp?: string;
    ogrn?: string;
    type?: "LEGAL" | "INDIVIDUAL";
    name?: {
      full_with_opf?: string;
      short_with_opf?: string;
    };
    address?: { value?: string; unrestricted_value?: string };
    management?: { name?: string; post?: string };
    state?: {
      status?: CompanyLookupResult["registryStatus"];
      registration_date?: number | null;
    };
  };
};

type DaDataResponse = { suggestions?: DaDataSuggestion[] };

export async function lookupCompanyByInn(
  rawInn: string,
  accountType: AccountType
): Promise<CompanyLookupResult> {
  const inn = normalizeInn(rawInn);

  if (!isValidRussianInn(inn)) {
    throw new Error("ИНН введён неверно. Проверьте цифры.");
  }

  const apiKey = process.env.DADATA_API_KEY;
  if (!apiKey) {
    throw new Error("На сервере не настроен DADATA_API_KEY.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(
      "https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Token ${apiKey}`,
        },
        body: JSON.stringify({ query: inn, count: 10 }),
        cache: "no-store",
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new Error("Сервис проверки ИНН временно недоступен.");
    }

    const payload = (await response.json()) as DaDataResponse;
    const suggestion = payload.suggestions?.find(
      (item) => item.data?.inn === inn
    );

    if (!suggestion?.data?.inn || !suggestion.data.ogrn || !suggestion.data.type) {
      throw new Error("По этому ИНН организация или ИП не найдены.");
    }

    const company: CompanyLookupResult = {
      inn: suggestion.data.inn,
      kpp: suggestion.data.kpp || undefined,
      ogrn: suggestion.data.ogrn,
      officialName:
        suggestion.data.name?.full_with_opf ||
        suggestion.unrestricted_value ||
        suggestion.value ||
        "Организация",
      shortName:
        suggestion.data.name?.short_with_opf ||
        suggestion.value ||
        suggestion.data.name?.full_with_opf ||
        "Организация",
      legalAddress:
        suggestion.data.address?.unrestricted_value ||
        suggestion.data.address?.value ||
        undefined,
      registryType: suggestion.data.type,
      registryStatus: suggestion.data.state?.status || "LIQUIDATED",
      managementName: suggestion.data.management?.name || undefined,
      managementPost: suggestion.data.management?.post || undefined,
      registrationDate: suggestion.data.state?.registration_date || null,
    };

    validateCompanyForAccount(company, accountType);
    return company;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Сервис проверки ИНН не ответил вовремя.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
