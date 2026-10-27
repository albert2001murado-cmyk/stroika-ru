export type VerificationStatus = "pending" | "approved" | "rejected";
export type VerificationRole = "contractor" | "customer" | "both";
export type VerificationForm = {
  name: string;
  phone: string;
  city: string;
  role: VerificationRole;
  category: string;
  experience: string;
  message: string;
};
export type VerificationRequest = VerificationForm & {
  id: string;
  userId: string;
  email: string;
  status: VerificationStatus;
  accountType: string;
  companyName: string;
  inn: string;
  ogrn: string;
  legalAddress: string;
  moderatorComment: string;
  createdAt: number;
  reviewedAt: number;
  profileSnapshot: {
    avatarUrl: string;
    displayName: string;
    accountType: string;
  };
};
export type VerificationState = {
  verified: boolean;
  request: VerificationRequest | null;
};
export const VERIFICATION_ROLES = [
  { id: "contractor", title: "Исполнитель" },
  { id: "customer", title: "Заказчик" },
  { id: "both", title: "Обе роли" },
] as const;
export const VERIFICATION_CATEGORIES = [
  "Ремонт квартир",
  "Отделочные работы",
  "Электрика",
  "Сантехника",
  "Полы",
  "Крыша и фасад",
  "Окна и двери",
  "Инженерные системы",
  "Участок и благоустройство",
  "Мебель",
  "Материалы",
  "Спецтехника",
  "Строительство",
  "Дизайн и проектирование",
  "Дополнительные услуги",
  "Другое",
];
export const EMPTY_VERIFICATION_FORM: VerificationForm = {
  name: "",
  phone: "",
  city: "",
  role: "contractor",
  category: "Ремонт квартир",
  experience: "",
  message: "",
};

/** Only fields protected by Firestore rules count as account verification. */
export function isAccountVerified(
  profile?: Record<string, unknown> | null,
): boolean {
  return Boolean(
    profile &&
      (profile.verified === true ||
        profile.isVerified === true ||
        profile.verificationStatus === "approved" ||
        profile.verificationStatus === "verified"),
  );
}
export function canAccountPublish(
  profile?: Record<string, unknown> | null,
): boolean {
  return Boolean(
    profile &&
      profile.moderationStatus !== "blocked" &&
      isAccountVerified(profile) &&
      (!profile.accountType ||
        profile.accountType === "individual" ||
        profile.verificationStatus === "approved"),
  );
}
export function verificationFormError(value: VerificationForm): string {
  if (value.name.trim().length < 2 || value.name.trim().length > 120)
    return "Укажите имя или название — от 2 до 120 символов.";
  if (!/^\+7\d{10}$/.test(value.phone))
    return "Сначала сохраните корректный телефон в настройках профиля.";
  if (value.city.trim().length < 2 || value.city.trim().length > 120)
    return "Укажите город — от 2 до 120 символов.";
  if (!VERIFICATION_ROLES.some((role) => role.id === value.role))
    return "Выберите роль на площадке.";
  if (
    value.role !== "customer" &&
    (!VERIFICATION_CATEGORIES.includes(value.category) ||
      value.experience.length > 80)
  )
    return "Проверьте направление и опыт работы.";
  if (value.message.trim().length < 20 || value.message.trim().length > 3000)
    return "Расскажите о себе или компании — от 20 до 3000 символов.";
  return "";
}
export function verificationButtonLabel(
  profile?: Record<string, unknown> | null,
): string {
  return profile?.verificationStatus === "pending"
    ? "Заявка на проверке"
    : profile?.verificationStatus === "rejected"
      ? "Повторить проверку"
      : "Пройти проверку";
}
export function verificationStatusLabel(status?: string): string {
  return status === "approved"
    ? "Одобрено"
    : status === "rejected"
      ? "Отклонено"
      : "На проверке";
}
export function verificationRoleLabel(role?: string): string {
  return (
    VERIFICATION_ROLES.find((item) => item.id === role)?.title || "Исполнитель"
  );
}
