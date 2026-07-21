"use client";

export type OfferGroup = "materials" | "services" | "equipment" | "complex";

export type OfferActionOption = {
  id: string;
  label: string;
  description: string;
  keywords: string[];
};

export type OfferFeatureOption = {
  id: string;
  label: string;
  description: string;
  keywords: string[];
};

export type SearchableListingFields = {
  searchGroup?: string;
  offerAction?: string;
  offerActionLabel?: string;
  offerFeatures?: Record<string, boolean>;
  searchTags?: string[];
  searchText?: string;
  searchVersion?: number;
};

const GROUP_INFO: Record<
  OfferGroup,
  {
    title: string;
    description: string;
    emoji: string;
  }
> = {
  materials: {
    title: "Материалы",
    description: "Продажа, производство и поставка строительных материалов",
    emoji: "🧱",
  },
  services: {
    title: "Услуги",
    description: "Отдельные работы мастера, бригады или компании",
    emoji: "👷",
  },
  equipment: {
    title: "Спецтехника",
    description: "Аренда техники, работа с оператором и доставка",
    emoji: "🚜",
  },
  complex: {
    title: "Комплексное решение",
    description: "Ремонт, строительство и выполнение работ под ключ",
    emoji: "🏗️",
  },
};

const ACTIONS: Record<OfferGroup, OfferActionOption[]> = {
  materials: [
    {
      id: "material_sale",
      label: "Продажа материалов",
      description: "Материалы в наличии или под заказ",
      keywords: ["купить", "продажа", "материалы", "продавец"],
    },
    {
      id: "material_production",
      label: "Производство материалов",
      description: "Собственное производство и изготовление",
      keywords: ["производитель", "производство", "изготовление", "завод"],
    },
    {
      id: "material_supply",
      label: "Комплексная поставка",
      description: "Комплектация объекта несколькими материалами",
      keywords: ["поставка", "комплектация", "снабжение", "опт"],
    },
  ],
  services: [
    {
      id: "service",
      label: "Выполнение работы",
      description: "Отдельная строительная или ремонтная услуга",
      keywords: ["услуга", "мастер", "исполнитель", "работа"],
    },
    {
      id: "service_turnkey",
      label: "Работа под ключ",
      description: "Полный цикл работы одним исполнителем",
      keywords: ["под ключ", "полный комплекс", "весь комплекс"],
    },
    {
      id: "service_consultation",
      label: "Выезд и консультация",
      description: "Осмотр объекта, консультация и расчёт",
      keywords: ["выезд", "консультация", "осмотр", "расчет", "стоимость"],
    },
  ],
  equipment: [
    {
      id: "equipment_rent",
      label: "Аренда техники",
      description: "Сдача спецтехники в аренду",
      keywords: ["аренда", "арендовать", "спецтехника"],
    },
    {
      id: "equipment_work",
      label: "Работа техникой",
      description: "Выполнение задачи на объекте",
      keywords: ["работа техникой", "услуги техники", "выезд на объект"],
    },
    {
      id: "equipment_transport",
      label: "Перевозка и доставка",
      description: "Доставка техники или перевозка грузов",
      keywords: ["доставка", "перевозка", "трал", "транспортировка"],
    },
  ],
  complex: [
    {
      id: "complex_turnkey",
      label: "Выполнение под ключ",
      description: "Полный комплекс работ от начала до результата",
      keywords: ["под ключ", "полный комплекс", "генподряд"],
    },
    {
      id: "complex_stage",
      label: "Отдельный этап работ",
      description: "Конкретный этап работы",
      keywords: ["этап работ", "отдельный этап", "часть работ"],
    },
    {
      id: "complex_project",
      label: "Проектирование и расчёт",
      description: "Проект, смета, замеры и расчёт стоимости",
      keywords: ["проектирование", "проект", "смета", "расчет", "стоимость"],
    },
  ],
};

const FEATURES: Record<OfferGroup, OfferFeatureOption[]> = {
  materials: [
    {
      id: "deliveryAvailable",
      label: "Есть доставка",
      description: "Привезёте материалы на объект",
      keywords: ["доставка", "доставим", "привезем"],
    },
    {
      id: "pickupAvailable",
      label: "Самовывоз",
      description: "Покупатель может забрать самостоятельно",
      keywords: ["самовывоз", "забрать со склада"],
    },
    {
      id: "wholesaleAvailable",
      label: "Оптовые заказы",
      description: "Работаете с крупными партиями",
      keywords: ["опт", "оптовые заказы", "крупная партия"],
    },
  ],
  services: [
    {
      id: "urgentAvailable",
      label: "Срочный выезд",
      description: "Можете быстро приступить к работе",
      keywords: ["срочно", "срочный выезд", "быстрый выезд"],
    },
    {
      id: "travelAvailable",
      label: "Выезд по области",
      description: "Работаете не только в своём городе",
      keywords: ["выезд по области", "работа по области"],
    },
    {
      id: "warrantyAvailable",
      label: "Гарантия на работу",
      description: "Предоставляете гарантию заказчику",
      keywords: ["гарантия", "гарантия на работу"],
    },
  ],
  equipment: [
    {
      id: "operatorIncluded",
      label: "Есть оператор",
      description: "Техника предоставляется с оператором",
      keywords: ["оператор", "с оператором", "машинист"],
    },
    {
      id: "hourlyRental",
      label: "Почасовая аренда",
      description: "Можно заказать технику на несколько часов",
      keywords: ["почасовая аренда", "за час", "часовая"],
    },
    {
      id: "dailyRental",
      label: "Посуточная аренда",
      description: "Можно арендовать на смену или сутки",
      keywords: ["посуточная аренда", "на сутки", "за смену"],
    },
    {
      id: "deliveryAvailable",
      label: "Доставка техники",
      description: "Организуете доставку на объект",
      keywords: ["доставка", "доставка техники", "трал"],
    },
  ],
  complex: [
    {
      id: "estimateAvailable",
      label: "Составление сметы",
      description: "Рассчитаете стоимость до начала работ",
      keywords: ["смета", "расчет стоимости", "стоимость"],
    },
    {
      id: "materialsIncluded",
      label: "Материалы включены",
      description: "Можете взять закупку материалов на себя",
      keywords: ["материалы включены", "закупка материалов", "комплектация"],
    },
    {
      id: "warrantyAvailable",
      label: "Гарантия",
      description: "Предоставляете гарантию на результат",
      keywords: ["гарантия", "гарантия на работы"],
    },
    {
      id: "travelAvailable",
      label: "Выезд по области",
      description: "Берёте объекты за пределами города",
      keywords: ["выезд по области", "работа по области"],
    },
  ],
};

const CATEGORY_KEYWORDS: Array<{
  keys: string[];
  keywords: string[];
}> = [
  {
    keys: ["элект"],
    keywords: ["электрик", "электромонтаж", "проводка", "кабель", "розетки"],
  },
  {
    keys: ["сант"],
    keywords: ["сантехник", "трубы", "водоснабжение", "канализация"],
  },
  {
    keys: ["материал"],
    keywords: ["стройматериалы", "строительные материалы"],
  },
  {
    keys: ["спецтехника"],
    keywords: ["техника", "аренда техники"],
  },
  {
    keys: ["строительство"],
    keywords: ["строители", "бригада", "подрядчик", "строительные работы"],
  },
  {
    keys: ["ремонт квартир"],
    keywords: ["ремонт", "ремонтная бригада", "отделка"],
  },
];

const GENERIC_INTENT_WORDS = new Set([
  "купить",
  "заказать",
  "найти",
  "показать",
  "арендовать",
  "предложения",
  "предложение",
  "услуги",
  "услуга",
  "работа",
  "работы",
]);

function normalize(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function getOfferGroup(category: string): OfferGroup {
  const value = normalize(category);

  if (value.includes("материал")) return "materials";
  if (value.includes("спецтехника")) return "equipment";

  if (
    value.includes("строительство") ||
    value.includes("ремонт квартир")
  ) {
    return "complex";
  }

  return "services";
}

export function getOfferGroupInfo(group: OfferGroup) {
  return GROUP_INFO[group];
}

export function getOfferActions(group: OfferGroup) {
  return ACTIONS[group];
}

export function getOfferFeatures(group: OfferGroup) {
  return FEATURES[group];
}

export function buildListingSearchTags(input: {
  title: string;
  description: string;
  category: string;
  subcategory: string;
  city: string;
  group: OfferGroup;
  actionId: string;
  enabledFeatureIds: string[];
}) {
  const action = ACTIONS[input.group].find(
    (item) => item.id === input.actionId
  );

  const enabledFeatures = FEATURES[input.group].filter((item) =>
    input.enabledFeatureIds.includes(item.id)
  );

  const categoryValue = normalize(input.category);
  const categorySynonyms = CATEGORY_KEYWORDS.flatMap((item) =>
    item.keys.some((key) => categoryValue.includes(normalize(key)))
      ? item.keywords
      : []
  );

  const rawValues = [
    input.title,
    input.description,
    input.category,
    input.subcategory,
    input.city,
    GROUP_INFO[input.group].title,
    action?.label || "",
    ...(action?.keywords || []),
    ...enabledFeatures.flatMap((item) => [item.label, ...item.keywords]),
    ...categorySynonyms,
  ];

  const normalizedPhrases = rawValues.map(normalize).filter(Boolean);
  const words = normalizedPhrases.flatMap((item) =>
    item.split(" ").filter((word) => word.length >= 2)
  );

  return unique([...normalizedPhrases, ...words]).slice(0, 120);
}

function featureWords(features?: Record<string, boolean>) {
  if (!features) return "";

  return Object.entries(features)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key)
    .join(" ");
}

export function matchesListingSearch(
  listing: Record<string, any>,
  search: string,
  selectedCategory = "",
  selectedSubcategory = ""
) {
  const normalizedQuery = normalize(search);

  if (!normalizedQuery) return true;

  const structured = Boolean(
    listing.searchVersion ||
      listing.searchText ||
      listing.searchTags?.length ||
      listing.offerAction
  );

  const text = normalize(
    [
      listing.title,
      listing.description,
      listing.authorName,
      listing.category,
      listing.subcategory,
      listing.city,
      listing.phone,
      listing.searchGroup,
      listing.offerAction,
      listing.offerActionLabel,
      listing.searchText,
      Array.isArray(listing.searchTags) ? listing.searchTags.join(" ") : "",
      featureWords(listing.offerFeatures),
    ]
      .filter(Boolean)
      .join(" ")
  );

  const words = normalizedQuery.split(" ").filter(Boolean);

  const requiresDelivery = words.includes("доставка");
  const requiresOperator = words.includes("оператор");
  const requiresCost =
    words.includes("стоимость") ||
    words.includes("смета") ||
    words.includes("расчет");
  const requiresTurnkey =
    normalizedQuery.includes("под ключ") ||
    (words.includes("под") && words.includes("ключ"));

  if (structured) {
    if (requiresDelivery && !text.includes("достав")) return false;
    if (requiresOperator && !text.includes("оператор")) return false;

    if (
      requiresCost &&
      !["стоимость", "смета", "расчет"].some((item) => text.includes(item))
    ) {
      return false;
    }

    if (requiresTurnkey) {
      const offerAction = normalize(listing.offerAction);
      const offerActionLabel = normalize(listing.offerActionLabel);

      const isTurnkeyOffer =
        offerAction === "complex_turnkey" ||
        offerAction === "service_turnkey" ||
        offerActionLabel === "выполнение под ключ" ||
        offerActionLabel === "работа под ключ";

      if (!isTurnkeyOffer) return false;
    }
  }

  if (text.includes(normalizedQuery)) return true;

  const actionWords = new Set([
    "доставка",
    "оператор",
    "стоимость",
    "смета",
    "расчет",
    "под",
    "ключ",
  ]);

  const contentWords = words.filter(
    (word) =>
      !GENERIC_INTENT_WORDS.has(word) &&
      !actionWords.has(word)
  );

  if (!structured) {
    if (!contentWords.length) return true;
    return contentWords.every((word) => text.includes(word));
  }

  if (selectedSubcategory) {
    return true;
  }

  if (!contentWords.length) {
    return true;
  }

  if (contentWords.length >= 3 || selectedCategory) {
    return contentWords.some((word) => text.includes(word));
  }

  return contentWords.every((word) => text.includes(word));
}
