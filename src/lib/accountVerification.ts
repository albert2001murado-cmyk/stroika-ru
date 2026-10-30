export type VerificationStatus = "pending" | "approved" | "rejected";
export type VerificationRole = "contractor" | "customer" | "both";
export type VerificationAccountType = "individual" | "ip" | "ooo";
export type VerificationAttachmentKind =
  | "registration"
  | "authority"
  | "portfolio";
export type VerificationAttachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  kind: VerificationAttachmentKind;
};
export const VERIFICATION_FILE_LIMIT = 10 * 1024 * 1024;
export const VERIFICATION_MAX_FILES = 6;
export const VERIFICATION_FILE_ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp";
export type VerificationForm = {
  accountType: VerificationAccountType;
  name: string;
  firstName: string;
  lastName: string;
  patronymic: string;
  birthYear: string;
  companyRole: "owner" | "representative";
  attachments: VerificationAttachment[];
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
  accountType?: VerificationAccountType;
  retryAt?: number;
};
export const VERIFICATION_RETRY_MS = 24 * 60 * 60 * 1000;
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
  accountType: "individual",
  name: "",
  firstName: "",
  lastName: "",
  patronymic: "",
  birthYear: "",
  companyRole: "owner",
  attachments: [],
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
  return Boolean(profile && profile.moderationStatus !== "blocked");
}
export function publicationVerificationFields(
  profile?: Record<string, unknown> | null,
) {
  const verified = isAccountVerified(profile),
    status = verified ? "approved" : "unverified";
  return {
    verified,
    isVerified: verified,
    authorVerified: verified,
    customerVerified: verified,
    userVerified: verified,
    profileVerified: verified,
    verificationStatus: status,
    identityVerificationStatus: status,
    verification: { status },
  };
}
export function verificationFormError(value: VerificationForm): string {
  if (value.accountType === "individual") {
    for (const [label, name] of [
      ["имя", value.firstName],
      ["фамилию", value.lastName],
    ]) {
      if (
        typeof name !== "string" ||
        name.trim().length < 2 ||
        name.trim().length > 60
      )
        return `Укажите ${label} — от 2 до 60 символов.`;
    }
    if (value.patronymic.length > 60) return "Отчество — до 60 символов.";
    if (
      !/^\d{4}$/.test(value.birthYear) ||
      Number(value.birthYear) < 1900 ||
      Number(value.birthYear) > new Date().getFullYear()
    )
      return "Укажите корректный год рождения.";
  } else if (value.accountType === "ip" || value.accountType === "ooo") {
    if (value.name.trim().length < 2 || value.name.trim().length > 120)
      return "Укажите имя представителя — от 2 до 120 символов.";
    if (!["owner", "representative"].includes(value.companyRole))
      return "Выберите вашу связь с компанией.";
    if (!value.attachments.some((file) => file.kind === "registration"))
      return "Приложите документ о регистрации ИП или ООО.";
    if (
      value.companyRole === "representative" &&
      !value.attachments.some((file) => file.kind === "authority")
    )
      return "Приложите документ, подтверждающий ваши полномочия.";
  } else return "Не удалось определить тип аккаунта. Обновите профиль.";
  if (
    value.attachments.length > VERIFICATION_MAX_FILES ||
    new Set(value.attachments.map((file) => file.id)).size !==
      value.attachments.length
  )
    return `Можно прикрепить до ${VERIFICATION_MAX_FILES} разных файлов.`;
  if (
    value.attachments.some(
      (file) =>
        !/^[a-f0-9-]{36}$/.test(file.id) ||
        file.size <= 0 ||
        file.size > VERIFICATION_FILE_LIMIT ||
        (value.accountType === "individual"
          ? file.kind !== "portfolio"
          : !["registration", "authority"].includes(file.kind)),
    )
  )
    return "Проверьте прикреплённые файлы и загрузите их повторно.";
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
export function verificationAccountType(
  value: unknown,
): VerificationAccountType {
  return value === "ip" || value === "ooo" ? value : "individual";
}
export function verificationFullName(
  value: Pick<VerificationForm, "firstName" | "lastName" | "patronymic">,
): string {
  return [value.lastName, value.firstName, value.patronymic]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}
export function verificationAttachmentLabel(
  kind: VerificationAttachmentKind,
): string {
  return kind === "registration"
    ? "Документы о регистрации"
    : kind === "authority"
      ? "Подтверждение полномочий"
      : "Портфолио";
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
