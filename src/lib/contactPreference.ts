export type ContactPreference = "both" | "messages" | "calls";

export const CONTACT_PREFERENCE_OPTIONS: Array<{
  value: ContactPreference;
  title: string;
  description: string;
}> = [
  {
    value: "both",
    title: "Звонки и сообщения",
    description: "Исполнители смогут написать в чат или позвонить",
  },
  {
    value: "messages",
    title: "Только сообщения",
    description: "Связь только через чат Стройка.ру",
  },
  {
    value: "calls",
    title: "Только звонки",
    description: "Номер увидят авторизованные исполнители",
  },
];

export function normalizeContactPreference(value: unknown): ContactPreference {
  return value === "messages" || value === "calls" ? value : "both";
}

export function contactAllowsMessages(value: unknown) {
  return normalizeContactPreference(value) !== "calls";
}

export function contactAllowsCalls(value: unknown) {
  return normalizeContactPreference(value) !== "messages";
}
