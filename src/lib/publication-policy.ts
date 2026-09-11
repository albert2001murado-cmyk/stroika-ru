import {
  CATALOG_FORM_SECTIONS,
  getCatalogFormCategories,
  type CatalogFormCategory,
  type CatalogSectionId,
} from "@/data/catalogForm";

export type PublicationKind = "listing" | "request";
export type PublicationModerationStatus =
  | "pending"
  | "manual_review"
  | "approved"
  | "rejected";
export type ModerationSeverity = "changes" | "review" | "critical";

export type ModerationFlag = {
  code: string;
  field: string;
  message: string;
  severity: ModerationSeverity;
  legalBasis?: string;
};

export type NormalizedCatalog = {
  valid: boolean;
  section: CatalogSectionId | "";
  categoryId: string;
  categoryTitle: string;
  groupId: string;
  category: string;
  subcategory: string;
  catalogKey: string;
  subcategoryKey: string;
};

export type LocalModerationResult = {
  decision: "approved" | "manual_review" | "rejected";
  reason: string;
  flags: ModerationFlag[];
  catalog: NormalizedCatalog;
  cityKey: string;
  textForClassifier: string;
  media: Array<{ type: "image" | "video"; url: string }>;
};

export const MODERATION_POLICY_VERSION = "ru-service-2026-09-09.1";

const SERVICE_RULES = "Правила публикации Стройка.ру";
const LAW_INFORMATION = "149-ФЗ «Об информации, информационных технологиях и о защите информации»";
const LAW_PERSONAL_DATA = "152-ФЗ «О персональных данных»";
const LAW_ADVERTISING = "38-ФЗ «О рекламе»";
const LAW_EXTREMISM = "114-ФЗ «О противодействии экстремистской деятельности»";

const CRITICAL_RULES: Array<{
  code: string;
  pattern: RegExp;
  message: string;
  legalBasis: string;
}> = [
  {
    code: "illegal-drugs",
    pattern:
      /(?:(?<![\p{L}\p{N}])(?:продам|куплю|доставлю|закладк[\p{L}\p{N}_]*|оптом)(?![\p{L}\p{N}]).{0,55}(?<![\p{L}\p{N}])(?:наркотик[\p{L}\p{N}_]*|героин[\p{L}\p{N}_]*|кокаин[\p{L}\p{N}_]*|мефедрон[\p{L}\p{N}_]*|амфетамин[\p{L}\p{N}_]*)(?![\p{L}\p{N}]))|(?:(?<![\p{L}\p{N}])(?:наркотик[\p{L}\p{N}_]*|героин[\p{L}\p{N}_]*|кокаин[\p{L}\p{N}_]*|мефедрон[\p{L}\p{N}_]*|амфетамин[\p{L}\p{N}_]*)(?![\p{L}\p{N}]).{0,55}(?<![\p{L}\p{N}])(?:продам|куплю|доставлю|оптом)(?![\p{L}\p{N}]))/iu,
    message: "Запрещено предлагать вещества и товары с запрещённым оборотом.",
    legalBasis: LAW_INFORMATION,
  },
  {
    code: "illegal-documents",
    pattern:
      /(?<![\p{L}\p{N}])(?:продам|куплю|сделаю|изготовлю|оформлю)(?![\p{L}\p{N}]).{0,60}(?:поддельн[\p{L}\p{N}_]*\s+)(?:паспорт[\p{L}\p{N}_]*|удостоверени[\p{L}\p{N}_]*|диплом[\p{L}\p{N}_]*|лицензи[\p{L}\p{N}_]*|справк[\p{L}\p{N}_]*)/iu,
    message: "Запрещены предложения о продаже или изготовлении поддельных документов.",
    legalBasis: LAW_INFORMATION,
  },
  {
    code: "fraud-scheme",
    pattern:
      /(?:(?<![\p{L}\p{N}])обнал(?:ичивание|ичить|ичу)?(?![\p{L}\p{N}])|дроп[\p{L}\p{N}_]*\s+карт[\p{L}\p{N}_]*|денежн[\p{L}\p{N}_]*\s+мул[\p{L}\p{N}_]*|финансов[\p{L}\p{N}_]*\s+пирамид[\p{L}\p{N}_]*|продам\s+банковск[\p{L}\p{N}_]*\s+карт[\p{L}\p{N}_]*)/iu,
    message: "Публикация похожа на запрещённую финансовую или мошенническую схему.",
    legalBasis: `${LAW_INFORMATION}; ${SERVICE_RULES}`,
  },
  {
    code: "credential-theft",
    pattern:
      /(?<![\p{L}\p{N}])(?:пришлите|сообщите|передайте|куплю)(?![\p{L}\p{N}]).{0,45}(?:код[\p{L}\p{N}_]*\s+(?:из\s+)?смс|парол[\p{L}\p{N}_]*|cvv|cvc|данн[\p{L}\p{N}_]*\s+карт[\p{L}\p{N}_]*)/iu,
    message: "Нельзя запрашивать пароли, коды подтверждения или платёжные данные.",
    legalBasis: `${LAW_INFORMATION}; ${LAW_PERSONAL_DATA}`,
  },
  {
    code: "extremism-or-terror",
    pattern:
      /(?:вербовк[\p{L}\p{N}_]*|вступай[\p{L}\p{N}_]*|пропаганд[\p{L}\p{N}_]*|поддерж[\p{L}\p{N}_]*).{0,60}(?:террорист[\p{L}\p{N}_]*|экстремист[\p{L}\p{N}_]*|нацист[\p{L}\p{N}_]*)/iu,
    message: "Запрещены призывы и материалы экстремистского или террористического характера.",
    legalBasis: `${LAW_INFORMATION}; ${LAW_EXTREMISM}`,
  },
  {
    code: "illegal-bypass",
    pattern:
      /(?:обход[\p{L}\p{N}_]*|(?<![\p{L}\p{N}])без(?![\p{L}\p{N}])).{0,35}(?:сч[её]тчик[\p{L}\p{N}_]*|налог[\p{L}\p{N}_]*|лицензи[\p{L}\p{N}_]*|разрешени[\p{L}\p{N}_]*|допуск[\p{L}\p{N}_]*)|(?:врезк[\p{L}\p{N}_]*|подключени[\p{L}\p{N}_]*).{0,35}(?:незаконн[\p{L}\p{N}_]*|без\s+разрешени[\p{L}\p{N}_]*)/iu,
    message: "Нельзя предлагать обход обязательных разрешений, учёта или требований безопасности.",
    legalBasis: `${LAW_ADVERTISING}; ${SERVICE_RULES}`,
  },
];

const REVIEW_RULES: Array<{
  code: string;
  pattern: RegExp;
  message: string;
  legalBasis: string;
}> = [
  {
    code: "regulated-dangerous-work",
    pattern:
      /(?:взрывн[\p{L}\p{N}_]*\s+работ[\p{L}\p{N}_]*|взрывчат[\p{L}\p{N}_]*|огнестрельн[\p{L}\p{N}_]*\s+оружи[\p{L}\p{N}_]*|боеприпас[\p{L}\p{N}_]*|утилизаци[\p{L}\p{N}_]*\s+боеприпас[\p{L}\p{N}_]*)/iu,
    message: "Опасные или регулируемые работы требуют дополнительной проверки документов.",
    legalBasis: `${LAW_INFORMATION}; ${SERVICE_RULES}`,
  },
  {
    code: "official-representative-claim",
    pattern:
      /(?:официальн[\p{L}\p{N}_]*\s+(?:дилер|представител[\p{L}\p{N}_]*)|государственн[\p{L}\p{N}_]*\s+организаци[\p{L}\p{N}_]*)/iu,
    message: "Заявление об официальном статусе требует подтверждения.",
    legalBasis: `${LAW_ADVERTISING}; ${SERVICE_RULES}`,
  },
];

const PROFANITY =
  /(?<![\p{L}\p{N}])(?:бля(?:дь|дство)?|хуй[\p{L}\p{N}_]*|пизд[\p{L}\p{N}_]*|еб(?:ать|ан[\p{L}\p{N}_]*|уч[\p{L}\p{N}_]*)|мудак[\p{L}\p{N}_]*|шлюх[\p{L}\p{N}_]*)(?![\p{L}\p{N}])/iu;
const URL_PATTERN = /(?:https?:\/\/|www\.|t\.me\/|vk\.com\/|wa\.me\/)[^\s]+/giu;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/giu;
const PHONE_PATTERN = /(?:\+?7|8)[\s()\-]*\d{3}[\s()\-]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/gu;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, max = 10_000) {
  return typeof value === "string" ? value.normalize("NFKC").trim().slice(0, max) : "";
}

export function normalizeModerationText(value: unknown) {
  return text(value)
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCityKey(value: unknown) {
  return normalizeModerationText(text(value).split(",")[0])
    .replace(/^(?:г|город)\s+/, "")
    .trim();
}

function comparableCategory(value: unknown) {
  return normalizeModerationText(value);
}

function allCatalogOptions() {
  return CATALOG_FORM_SECTIONS.flatMap((section) =>
    getCatalogFormCategories(section.id).map((option) => ({ section: section.id, option }))
  );
}

function optionMatches(
  option: CatalogFormCategory,
  input: { categoryId: string; groupId: string; category: string; subcategory: string }
) {
  if (input.groupId && option.groupId === input.groupId) return true;
  if (input.categoryId && option.id === input.categoryId) return true;
  if (
    input.subcategory &&
    option.subcategories.some(
      (item) => comparableCategory(item) === comparableCategory(input.subcategory)
    )
  ) {
    return true;
  }
  return Boolean(
    input.category &&
      [option.category, option.title].some(
        (item) => comparableCategory(item) === comparableCategory(input.category)
      )
  );
}

export function normalizePublicationCatalog(dataValue: unknown): NormalizedCatalog {
  const data = object(dataValue);
  const requestedSection = text(data.catalogSection, 32) as CatalogSectionId;
  const input = {
    categoryId: text(data.catalogCategoryId, 80),
    groupId: text(data.catalogGroupId, 80),
    category: text(data.category, 180),
    subcategory: text(data.subcategory, 180),
  };
  const sectionValid = CATALOG_FORM_SECTIONS.some((item) => item.id === requestedSection);
  const preferred = sectionValid
    ? getCatalogFormCategories(requestedSection).map((option) => ({
        section: requestedSection,
        option,
      }))
    : [];
  const candidates = sectionValid ? preferred : allCatalogOptions();
  const findOption = (predicate: (option: CatalogFormCategory) => boolean) =>
    preferred.find(({ option }) => predicate(option)) ||
    candidates.find(({ option }) => predicate(option));
  const selected =
    (input.groupId ? findOption((option) => option.groupId === input.groupId) : undefined) ||
    (input.categoryId ? findOption((option) => option.id === input.categoryId && option.subcategories.some((item) => comparableCategory(item) === comparableCategory(input.subcategory))) : undefined) ||
    (input.subcategory ? findOption((option) => option.subcategories.some(
      (item) => comparableCategory(item) === comparableCategory(input.subcategory)
    )) : undefined) || findOption((option) => optionMatches(option, input));
  const subcategoryValid = Boolean(
    selected &&
      input.subcategory &&
      selected.option.subcategories.some(
        (item) => comparableCategory(item) === comparableCategory(input.subcategory)
      )
  );

  if (!selected || !subcategoryValid) {
    return {
      valid: false,
      section: sectionValid ? requestedSection : "",
      categoryId: input.categoryId,
      categoryTitle: text(data.catalogCategoryTitle, 180),
      groupId: input.groupId,
      category: input.category,
      subcategory: input.subcategory,
      catalogKey: "",
      subcategoryKey: normalizeModerationText(input.subcategory),
    };
  }

  const canonicalSubcategory =
    selected.option.subcategories.find(
      (item) => comparableCategory(item) === comparableCategory(input.subcategory)
    ) || input.subcategory;
  return {
    valid: true,
    section: selected.section,
    categoryId: selected.option.id,
    categoryTitle: selected.option.title,
    groupId: selected.option.groupId,
    category: selected.option.category,
    subcategory: canonicalSubcategory,
    catalogKey: `${selected.section}:${selected.option.id}`,
    subcategoryKey: normalizeModerationText(canonicalSubcategory),
  };
}

function validRemoteUrl(value: unknown) {
  const raw = text(value, 2_000);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function collectMedia(data: Record<string, unknown>) {
  const found = new Map<string, { type: "image" | "video"; url: string }>();
  const add = (type: "image" | "video", value: unknown) => {
    const url = validRemoteUrl(value);
    if (url) found.set(`${type}:${url}`, { type, url });
  };

  if (Array.isArray(data.media)) {
    data.media.forEach((item) => {
      const media = object(item);
      const type = media.type === "video" ? "video" : media.type === "image" ? "image" : null;
      if (type) add(type, media.url);
    });
  }
  if (Array.isArray(data.imageUrls)) data.imageUrls.forEach((url) => add("image", url));
  if (Array.isArray(data.videoUrls)) data.videoUrls.forEach((url) => add("video", url));
  return [...found.values()];
}

function looksLikeBankCard(value: string) {
  const candidates = value.match(/(?:\d[\s-]*){13,19}/g) || [];
  return candidates.some((candidate) => {
    const digits = candidate.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) return false;
    let sum = 0;
    let double = false;
    for (let index = digits.length - 1; index >= 0; index -= 1) {
      let digit = Number(digits[index]);
      if (double) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      double = !double;
    }
    return sum % 10 === 0;
  });
}

function titleHasExcessCaps(value: string) {
  const letters = [...value].filter((character) => /\p{L}/u.test(character));
  if (letters.length < 8) return false;
  const uppercase = letters.filter(
    (character) => character === character.toLocaleUpperCase("ru-RU")
  ).length;
  return uppercase / letters.length > 0.78;
}

function redactClassifierText(value: string) {
  return value
    .replace(EMAIL_PATTERN, "[email скрыт]")
    .replace(PHONE_PATTERN, "[телефон скрыт]")
    .replace(/(?:\d[\s-]*){13,19}/g, "[номер скрыт]")
    .slice(0, 8_000);
}

function reasonFromFlags(flags: ModerationFlag[], fallback: string) {
  const messages = [...new Set(flags.map((flag) => flag.message))].slice(0, 3);
  return messages.length ? messages.join(" ") : fallback;
}

export function evaluatePublicationLocally(
  kind: PublicationKind,
  dataValue: unknown
): LocalModerationResult {
  const data = object(dataValue);
  const title = text(data.title, 240);
  const description = text(data.description, 8_000);
  const city = text(data.city, 180);
  const combined = `${title}\n${description}`.trim();
  const normalized = normalizeModerationText(combined);
  const catalog = normalizePublicationCatalog(data);
  const media = collectMedia(data);
  const flags: ModerationFlag[] = [];
  const add = (flag: ModerationFlag) => flags.push(flag);

  if (title.length < 5 || title.length > 120) {
    add({
      code: "title-length",
      field: "title",
      severity: "changes",
      message: "Название должно содержать от 5 до 120 символов.",
      legalBasis: SERVICE_RULES,
    });
  }
  if (description.length < 20 || description.length > 5_000) {
    add({
      code: "description-length",
      field: "description",
      severity: "changes",
      message: "Описание должно содержать от 20 до 5000 символов.",
      legalBasis: SERVICE_RULES,
    });
  }
  if (city.length < 2 || city.length > 120 || !normalizeCityKey(city)) {
    add({
      code: "invalid-city",
      field: "city",
      severity: "changes",
      message: "Укажите корректный город без лишних данных.",
      legalBasis: SERVICE_RULES,
    });
  }
  if (!catalog.valid) {
    add({
      code: "invalid-catalog",
      field: "category",
      severity: "changes",
      message: "Выберите существующие каталог, категорию и подкатегорию.",
      legalBasis: SERVICE_RULES,
    });
  }
  if (title.match(URL_PATTERN) || title.match(EMAIL_PATTERN) || title.match(PHONE_PATTERN)) {
    add({
      code: "contacts-in-title",
      field: "title",
      severity: "changes",
      message: "Уберите ссылку, телефон или почту из названия — для связи есть отдельные поля.",
      legalBasis: `${LAW_ADVERTISING}; ${SERVICE_RULES}`,
    });
  }
  if (titleHasExcessCaps(title)) {
    add({
      code: "excess-caps",
      field: "title",
      severity: "changes",
      message: "Не пишите большую часть названия заглавными буквами.",
      legalBasis: SERVICE_RULES,
    });
  }
  if (PROFANITY.test(combined)) {
    add({
      code: "profanity",
      field: "content",
      severity: "changes",
      message: "Удалите оскорбления и нецензурную лексику.",
      legalBasis: SERVICE_RULES,
    });
  }
  if (looksLikeBankCard(combined)) {
    add({
      code: "bank-card-data",
      field: "description",
      severity: "critical",
      message: "Удалите номер банковской карты из открытого описания.",
      legalBasis: LAW_PERSONAL_DATA,
    });
  }
  if (/паспорт[\p{L}\p{N}_]*.{0,35}\d{2}\s*\d{2}\s*\d{6}/iu.test(combined)) {
    add({
      code: "passport-data",
      field: "description",
      severity: "critical",
      message: "Удалите паспортные данные из открытой публикации.",
      legalBasis: LAW_PERSONAL_DATA,
    });
  }
  if ((combined.match(URL_PATTERN) || []).length > 2) {
    add({
      code: "link-spam",
      field: "description",
      severity: "review",
      message: "Большое количество внешних ссылок требует дополнительной проверки.",
      legalBasis: `${LAW_ADVERTISING}; ${SERVICE_RULES}`,
    });
  }
  if (/(.)\1{9,}/u.test(combined) || /([\p{L}\p{N}_]+)(?:\s+\1){5,}/iu.test(normalized)) {
    add({
      code: "repeated-content",
      field: "content",
      severity: "changes",
      message: "Уберите повторяющийся текст и символы.",
      legalBasis: SERVICE_RULES,
    });
  }

  CRITICAL_RULES.forEach((rule) => {
    if (rule.pattern.test(normalized)) {
      add({
        code: rule.code,
        field: "content",
        severity: "critical",
        message: rule.message,
        legalBasis: rule.legalBasis,
      });
    }
  });
  REVIEW_RULES.forEach((rule) => {
    if (rule.pattern.test(normalized)) {
      add({
        code: rule.code,
        field: "content",
        severity: "review",
        message: rule.message,
        legalBasis: rule.legalBasis,
      });
    }
  });

  const imageCount = media.filter((item) => item.type === "image").length;
  const videoCount = media.filter((item) => item.type === "video").length;
  const invalidMediaCount = [
    ...(Array.isArray(data.imageUrls) ? data.imageUrls : []),
    ...(Array.isArray(data.videoUrls) ? data.videoUrls : []),
    ...(Array.isArray(data.media)
      ? data.media.map((item) => object(item).url).filter(Boolean)
      : []),
  ].filter((value) => !validRemoteUrl(value)).length;

  if (invalidMediaCount > 0) {
    add({
      code: "invalid-media-url",
      field: "media",
      severity: "changes",
      message: "Одно из вложений недоступно или имеет небезопасный адрес.",
      legalBasis: SERVICE_RULES,
    });
  }
  if (kind === "listing" && (imageCount > 15 || videoCount > 3)) {
    add({
      code: "media-limit",
      field: "media",
      severity: "changes",
      message: "Для анкеты разрешено до 15 фотографий и до 3 видео.",
      legalBasis: SERVICE_RULES,
    });
  }
  if (kind === "request" && (imageCount > 8 || videoCount > 0)) {
    add({
      code: "request-media-limit",
      field: "media",
      severity: "changes",
      message: "Для заявки разрешено до 8 фотографий без видео.",
      legalBasis: SERVICE_RULES,
    });
  }

  const hasCriticalOrChanges = flags.some(
    (flag) => flag.severity === "critical" || flag.severity === "changes"
  );
  const needsReview = flags.some((flag) => flag.severity === "review");
  const decision = hasCriticalOrChanges
    ? "rejected"
    : needsReview
      ? "manual_review"
      : "approved";

  return {
    decision,
    reason:
      decision === "approved"
        ? "Проверка по правилам сервиса пройдена."
        : reasonFromFlags(
            flags,
            decision === "manual_review"
              ? "Публикация направлена на дополнительную проверку."
              : "Исправьте публикацию и отправьте её повторно."
          ),
    flags,
    catalog,
    cityKey: normalizeCityKey(city),
    textForClassifier: redactClassifierText(combined),
    media,
  };
}
