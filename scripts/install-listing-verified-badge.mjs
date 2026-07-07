import fs from "fs";
import path from "path";

const root = process.cwd();
const filePath = path.join(root, "src/components/ListingCard.tsx");

if (!fs.existsSync(filePath)) {
  console.error("Не найден файл src/components/ListingCard.tsx");
  process.exit(1);
}

let text = fs.readFileSync(filePath, "utf8");

function addImport(source, importLine) {
  if (source.includes(importLine)) return source;

  const lines = source.split("\n");
  let insertIndex = 0;

  if (lines[0]?.includes('"use client"') || lines[0]?.includes("'use client'")) {
    insertIndex = 1;
    if (lines[1]?.trim() === "") insertIndex = 2;
  }

  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith("import ")) insertIndex = i + 1;
  }

  lines.splice(insertIndex, 0, importLine);
  return lines.join("\n");
}

text = addImport(
  text,
  'import ListingAuthorVerifiedBadge from "@/components/ListingAuthorVerifiedBadge";'
);

if (text.includes("<ListingAuthorVerifiedBadge")) {
  fs.writeFileSync(filePath, text, "utf8");
  console.log("Бейдж уже был вставлен. Только проверил импорт.");
  process.exit(0);
}

const badge = `<ListingAuthorVerifiedBadge listing={listing} />`;

// 1) Частый вариант: рядом с текстом "Новая анкета".
if (text.includes("Новая анкета")) {
  text = text.replace(
    /(Новая анкета[\s\S]{0,220}?<\/[^>]+>)/,
    `$1
                  ${badge}`
  );
  fs.writeFileSync(filePath, text, "utf8");
  console.log("Готово: бейдж вставлен рядом с блоком 'Новая анкета'.");
  process.exit(0);
}

// 2) Если есть authorName.
if (text.includes("authorName")) {
  text = text.replace(
    /(\{[^{}]*(?:authorName|userName|companyName)[^{}]*\})/,
    `$1
                  ${badge}`
  );
  fs.writeFileSync(filePath, text, "utf8");
  console.log("Готово: бейдж вставлен рядом с именем автора.");
  process.exit(0);
}

// 3) Если есть блок с ценой, вставляем перед ценой.
if (text.includes("Цена от")) {
  text = text.replace(
    /(Цена от)/,
    `${badge}
                $1`
  );
  fs.writeFileSync(filePath, text, "utf8");
  console.log("Готово: бейдж вставлен перед ценой.");
  process.exit(0);
}

console.error(`
Не смог автоматически найти место для вставки.

Сделай вручную в src/components/ListingCard.tsx:

1) сверху:
import ListingAuthorVerifiedBadge from "@/components/ListingAuthorVerifiedBadge";

2) рядом с именем исполнителя или текстом "Новая анкета":
<ListingAuthorVerifiedBadge listing={listing} />

Если у тебя объект называется не listing, а item, тогда:
<ListingAuthorVerifiedBadge listing={item} />
`);

process.exit(1);
