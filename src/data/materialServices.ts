export type MaterialServiceSection = "services" | "solutions";

export type MaterialServiceLink = {
  category: string;
  subcategory: string;
  section: MaterialServiceSection;
  imageCategoryId: string;
  actionTitle: string;
};

type ServiceTarget = Omit<MaterialServiceLink, "actionTitle"> & {
  actionTitle?: string;
};

const links = new Map<string, MaterialServiceLink>();
const materialNames = new Map<string, string>();

function normalize(value?: string) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е");
}

const MATERIAL_ACTION_TITLE_OVERRIDES = new Map<string, string>([
  [normalize("Бетон"), "Найти бетонщиков"],
  [normalize("Раствор"), "Найти мастеров по раствору"],
  [normalize("Железобетонные изделия"), "Найти монтажников ЖБИ"],
  [normalize("Фундаментные блоки"), "Найти монтажников ФБС"],
  [normalize("Плиты перекрытия"), "Найти монтажников перекрытий"],
  [normalize("Перемычки ЖБИ"), "Найти монтажников перемычек"],
  [normalize("Дорожные плиты"), "Найти дорожную бригаду"],
  [normalize("Сваи железобетонные"), "Найти специалистов по сваям"],
  [normalize("Лотки ЖБИ"), "Найти монтажников лотков"],
  [normalize("Арматура"), "Найти арматурщиков"],
  [normalize("Сетка кладочная"), "Найти мастеров по армированию кладки"],
  [normalize("Сетка сварная"), "Найти мастеров по сварной сетке"],
  [normalize("Фиброволокно"), "Найти мастеров по фибробетону"],
  [normalize("Пластификаторы для бетона"), "Найти технолога по бетону"],
  [normalize("Противоморозные добавки"), "Найти мастеров зимнего бетона"],
  [normalize("Септики"), "Найти монтажника септика"],
  [normalize("Станции биологической очистки"), "Найти монтажника станции очистки"],
  [normalize("Пластиковые колодцы"), "Найти монтажника колодцев"],
  [normalize("Ливневые лотки"), "Найти монтажника ливневки"],
  [normalize("Канализационные люки"), "Найти монтажника люков"],
  [normalize("Заборы и ограждения"), "Найти монтажника ограждений"],
]);

function createMaterialActionTitle(material: string, baseTitle?: string) {
  const override = MATERIAL_ACTION_TITLE_OVERRIDES.get(normalize(material));
  if (override) return override;

  const base = baseTitle || "Найти специалиста";
  const professionTitle = `${base} · ${material}`;

  return professionTitle.length <= 44
    ? professionTitle
    : `Найти специалиста: ${material}`;
}

function register(materials: string[], target: ServiceTarget) {
  materials.forEach((material) => {
    const key = normalize(material);
    links.set(key, {
      ...target,
      actionTitle: createMaterialActionTitle(material, target.actionTitle),
    });

    if (!materialNames.has(key)) {
      materialNames.set(key, material.trim());
    }
  });
}

register(["Бетон", "Бетон М100", "Бетон М150", "Бетон М200", "Бетон М250", "Бетон М300", "Бетон М350", "Бетон М400", "Цемент М400", "Цемент М500", "Белый цемент", "Пескобетон М300"], {
  category: "Строительство",
  subcategory: "Бетонные работы",
  section: "solutions",
  imageCategoryId: "construction",
  actionTitle: "Найти бетонщиков",
});

register(["Раствор"], {
  category: "Строительство",
  subcategory: "Кладка стен",
  section: "solutions",
  imageCategoryId: "construction",
  actionTitle: "Найти мастеров по раствору",
});

register(
  [
    "Железобетонные изделия",
    "Фундаментные блоки",
    "Плиты перекрытия",
    "Перемычки ЖБИ",
    "Дорожные плиты",
    "Сваи железобетонные",
    "Лотки ЖБИ",
  ],
  {
    category: "Строительство",
    subcategory: "Бетонные работы",
    section: "solutions",
    imageCategoryId: "construction",
    actionTitle: "Найти монтажников",
  }
);

register(
  [
    "Арматура",
    "Арматура А500С",
    "Композитная арматура",
    "Сетка кладочная",
    "Сетка сварная",
    "Фиброволокно",
    "Пластификаторы для бетона",
    "Противоморозные добавки",
  ],
  {
    category: "Строительство",
    subcategory: "Монолитные работы",
    section: "solutions",
    imageCategoryId: "construction",
    actionTitle: "Найти монолитчиков",
  }
);

register(
  [
    "Кирпич",
    "Кирпич полнотелый",
    "Кирпич пустотелый",
    "Газобетонные блоки",
    "Газобетон D400",
    "Газобетон D500",
    "Газобетон D600",
    "Пеноблоки",
    "Керамоблоки",
    "Шлакоблоки",
    "Пазогребневые плиты",
    "Силикатный кирпич",
    "Облицовочный кирпич",
    "Клинкерный кирпич",
    "Огнеупорный кирпич",
    "Теплоблоки",
    "Полистиролбетонные блоки",
  ],
  {
    category: "Строительство",
    subcategory: "Кладка стен",
    section: "solutions",
    imageCategoryId: "construction",
    actionTitle: "Найти каменщика",
  }
);

register(
  ["Гипсокартон", "ГВЛ", "Профили для гипсокартона", "Серпянка", "Уголки штукатурные"],
  {
    category: "Отделочные работы",
    subcategory: "Гипсокартон",
    section: "services",
    imageCategoryId: "finishing",
    actionTitle: "Найти монтажника",
  }
);

register(["Натяжные потолки"], {
  category: "Отделочные работы",
  subcategory: "Натяжные потолки",
  section: "services",
  imageCategoryId: "finishing",
  actionTitle: "Найти монтажника потолков",
});

register(["Подвесные потолки", "Потолочные панели"], {
  category: "Отделочные работы",
  subcategory: "Подвесные потолки",
  section: "services",
  imageCategoryId: "finishing",
  actionTitle: "Найти монтажника потолков",
});

register(["Звукоизоляционные панели", "Акустические мембраны", "Демпферная лента"], {
  category: "Отделочные работы",
  subcategory: "Звукоизоляция",
  section: "services",
  imageCategoryId: "finishing",
  actionTitle: "Найти специалиста по звукоизоляции",
});

register(["Плитка керамическая", "Мозаика", "Клей для плитки", "Затирка для плитки"], {
  category: "Полы",
  subcategory: "Укладка плитки",
  section: "services",
  imageCategoryId: "floors",
  actionTitle: "Найти плиточника",
});

register(["Керамогранит"], {
  category: "Полы",
  subcategory: "Укладка керамогранита",
  section: "services",
  imageCategoryId: "floors",
  actionTitle: "Найти плиточника",
});

register(["Ламинат", "Кварцвинил", "SPC-ламинат", "Подложка для пола"], {
  category: "Полы",
  subcategory: "Укладка ламината",
  section: "services",
  imageCategoryId: "floors",
  actionTitle: "Найти мастера по полу",
});

register(["Паркет"], {
  category: "Полы",
  subcategory: "Укладка паркета",
  section: "services",
  imageCategoryId: "floors",
  actionTitle: "Найти паркетчика",
});

register(["Инженерная доска"], {
  category: "Полы",
  subcategory: "Укладка инженерной доски",
  section: "services",
  imageCategoryId: "floors",
  actionTitle: "Найти мастера по полу",
});

register(["Наливные полы", "Терраццо"], {
  category: "Полы",
  subcategory: "Наливные полы",
  section: "services",
  imageCategoryId: "floors",
  actionTitle: "Найти мастера по полам",
});

register(["Стяжка для пола"], {
  category: "Полы",
  subcategory: "Стяжка пола",
  section: "services",
  imageCategoryId: "floors",
  actionTitle: "Найти мастера по стяжке",
});

register(
  [
    "Кровельные материалы",
    "Металлочерепица",
    "Профнастил",
    "Гибкая черепица",
    "Ондулин",
    "Шифер",
    "Фальцевая кровля",
    "Композитная черепица",
    "Мембранная кровля",
    "Софиты",
    "Доборные элементы кровли",
    "Рубероид",
  ],
  {
    category: "Крыша и фасад",
    subcategory: "Монтаж кровли",
    section: "services",
    imageCategoryId: "roof",
    actionTitle: "Найти кровельщика",
  }
);

register(["Водосточные системы"], {
  category: "Крыша и фасад",
  subcategory: "Монтаж водостоков",
  section: "services",
  imageCategoryId: "roof",
  actionTitle: "Найти монтажника водостоков",
});

register(
  [
    "Сайдинг",
    "Фасадные панели",
    "Клинкерная плитка",
    "Искусственный камень",
    "Натуральный камень",
    "Сэндвич-панели",
    "HPL-панели",
    "Фиброцементные панели",
    "Термопанели",
  ],
  {
    category: "Крыша и фасад",
    subcategory: "Облицовка фасада",
    section: "services",
    imageCategoryId: "roof",
    actionTitle: "Найти фасадчика",
  }
);

register(
  [
    "Утеплитель минеральная вата",
    "Утеплитель базальтовый",
    "Стекловата",
    "Эковата",
    "PIR-плиты",
    "Пеностекло",
    "Пробковый утеплитель",
  ],
  {
    category: "Крыша и фасад",
    subcategory: "Утепление фасада",
    section: "services",
    imageCategoryId: "roof",
    actionTitle: "Найти мастера по утеплению",
  }
);

register(["Окна", "Алюминиевые окна", "Деревянные окна", "ПВХ-профили", "Стеклопакеты", "Подоконники", "Откосы"], {
  category: "Окна и двери",
  subcategory: "Установка окон",
  section: "services",
  imageCategoryId: "windows",
  actionTitle: "Найти монтажника окон",
});

register(["Двери"], {
  category: "Окна и двери",
  subcategory: "Установка дверей",
  section: "services",
  imageCategoryId: "windows",
  actionTitle: "Найти монтажника дверей",
});

register(["Трубы водопроводные", "Полипропиленовые трубы", "ПНД-трубы", "Медные трубы", "Металлопластиковые трубы", "Фитинги", "Запорная арматура"], {
  category: "Сантехника",
  subcategory: "Монтаж водоснабжения",
  section: "services",
  imageCategoryId: "plumbing",
  actionTitle: "Найти сантехника",
});

register(["Трубы канализационные"], {
  category: "Сантехника",
  subcategory: "Монтаж канализации",
  section: "services",
  imageCategoryId: "plumbing",
  actionTitle: "Найти сантехника",
});

register(["Септики", "Станции биологической очистки", "Пластиковые колодцы"], {
  category: "Участок и благоустройство",
  subcategory: "Установка септика",
  section: "services",
  imageCategoryId: "landscape",
  actionTitle: "Найти монтажника септика",
});

register(["Трубы отопления", "Радиаторы отопления", "Коллекторы"], {
  category: "Инженерные системы",
  subcategory: "Монтаж отопления",
  section: "services",
  imageCategoryId: "engineering",
  actionTitle: "Найти монтажника отопления",
});

register(["Котлы"], {
  category: "Инженерные системы",
  subcategory: "Установка котлов",
  section: "services",
  imageCategoryId: "engineering",
  actionTitle: "Найти мастера по котлам",
});

register(["Тёплый пол"], {
  category: "Электрика",
  subcategory: "Установка тёплого пола",
  section: "services",
  imageCategoryId: "electric",
  actionTitle: "Найти монтажника тёплого пола",
});

register(["Кабель и провод", "Гофра для кабеля", "Кабель-каналы", "Слаботочный кабель"], {
  category: "Электрика",
  subcategory: "Разводка электрики",
  section: "services",
  imageCategoryId: "electric",
  actionTitle: "Найти электрика",
});

register(["Электрощиты", "Автоматы", "УЗО", "Дифференциальные автоматы", "Контакторы", "Стабилизаторы напряжения", "Электросчётчики"], {
  category: "Электрика",
  subcategory: "Монтаж электрощита",
  section: "services",
  imageCategoryId: "electric",
  actionTitle: "Найти электрика",
});

register(["Розетки"], {
  category: "Электрика",
  subcategory: "Установка розеток",
  section: "services",
  imageCategoryId: "electric",
  actionTitle: "Найти электрика",
});

register(["Выключатели"], {
  category: "Электрика",
  subcategory: "Установка выключателей",
  section: "services",
  imageCategoryId: "electric",
  actionTitle: "Найти электрика",
});

register(["Светильники"], {
  category: "Электрика",
  subcategory: "Монтаж освещения",
  section: "services",
  imageCategoryId: "electric",
  actionTitle: "Найти электрика",
});

register(["Асфальт"], {
  category: "Участок и благоустройство",
  subcategory: "Асфальтирование",
  section: "services",
  imageCategoryId: "landscape",
  actionTitle: "Найти дорожную бригаду",
});

register(["Бордюры", "Тротуарная плитка", "Брусчатка", "Газонные решётки", "Садовый бордюр"], {
  category: "Участок и благоустройство",
  subcategory: "Укладка тротуарной плитки",
  section: "services",
  imageCategoryId: "landscape",
  actionTitle: "Найти бригаду по укладке",
});

register(["Геотекстиль", "Дренажные системы", "Дренажные трубы", "Дождеприёмники"], {
  category: "Участок и благоустройство",
  subcategory: "Дренаж участка",
  section: "services",
  imageCategoryId: "landscape",
  actionTitle: "Найти специалиста по дренажу",
});

register(["Ливневые лотки", "Канализационные люки"], {
  category: "Участок и благоустройство",
  subcategory: "Монтаж ливневой канализации",
  section: "services",
  imageCategoryId: "landscape",
  actionTitle: "Найти монтажника ливневки",
});

register(["Заборы и ограждения"], {
  category: "Участок и благоустройство",
  subcategory: "Установка ограждений",
  section: "services",
  imageCategoryId: "landscape",
  actionTitle: "Найти монтажника ограждений",
});

register(["Ворота и калитки"], {
  category: "Участок и благоустройство",
  subcategory: "Откатные ворота",
  section: "services",
  imageCategoryId: "landscape",
  actionTitle: "Найти монтажника ворот",
});

register(["Системы автополива"], {
  category: "Участок и благоустройство",
  subcategory: "Автополив",
  section: "services",
  imageCategoryId: "landscape",
  actionTitle: "Найти монтажника автополива",
});

export function getMaterialServiceLink(material?: string) {
  return links.get(normalize(material)) || null;
}

export function materialNeedsSpecialist(material?: string) {
  return Boolean(getMaterialServiceLink(material));
}

// Только материалы, для монтажа или применения которых нужна профильная работа.
export const MATERIAL_SPECIALIST_SUBCATEGORIES = Array.from(materialNames.values());
