import fs from "fs";
import path from "path";

const root = process.cwd();

function patchFile(filePath, patcher) {
  if (!fs.existsSync(filePath)) {
    console.log("Нет файла:", path.relative(root, filePath));
    return;
  }

  const before = fs.readFileSync(filePath, "utf8");
  const after = patcher(before);

  if (after !== before) {
    fs.writeFileSync(filePath, after, "utf8");
    console.log("Обновлён:", path.relative(root, filePath));
  } else {
    console.log("Без изменений:", path.relative(root, filePath));
  }
}

function addImport(text, importLine) {
  if (text.includes(importLine)) return text;

  const lines = text.split("\n");
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

// 1. Header лучше заменить готовым файлом вручную из архива.
// Этот скрипт добавляет только видимость галочки в карточки, если сможет.

// 2. ListingCard: добавляем бейдж рядом с названием, если найдём title.
patchFile(path.join(root, "src/components/ListingCard.tsx"), (text) => {
  text = addImport(text, 'import VerifiedBadge from "@/components/VerifiedBadge";');

  if (text.includes("listing.verified") || text.includes("item.verified")) {
    return text;
  }

  // Популярный вариант: если есть listing.title
  text = text.replace(
    /(\{listing\.title \|\| "Объявление"\})/,
    `$1\n                  {Boolean((listing as any).verified || (listing as any).isVerified) ? <VerifiedBadge size="sm" /> : null}`
  );

  // Другой вариант: если есть item.title
  text = text.replace(
    /(\{item\.title \|\| "Объявление"\})/,
    `$1\n                  {Boolean((item as any).verified || (item as any).isVerified) ? <VerifiedBadge size="sm" /> : null}`
  );

  return text;
});

// 3. Profile: добавляем карточку проверки ближе к началу main/section, если получится.
patchFile(path.join(root, "src/app/profile/page.tsx"), (text) => {
  text = addImport(text, 'import VerifiedProfileCard from "@/components/VerifiedProfileCard";');

  if (text.includes("<VerifiedProfileCard")) return text;

  const insert = `
        <VerifiedProfileCard
          verified={Boolean((profile as any)?.verified || (profile as any)?.isVerified || (profile as any)?.verificationStatus === "approved")}
          isOwnProfile={true}
        />
`;

  const firstSection = text.indexOf("<section");

  if (firstSection !== -1) {
    const end = text.indexOf(">", firstSection);

    if (end !== -1) {
      return text.slice(0, end + 1) + "\n" + insert + text.slice(end + 1);
    }
  }

  const mainEnd = text.lastIndexOf("</main>");
  if (mainEnd !== -1) {
    return text.slice(0, mainEnd) + insert + text.slice(mainEnd);
  }

  return text;
});

// 4. Public player page: показываем галочку другим пользователям, если получится.
patchFile(path.join(root, "src/app/user/[uid]/page.tsx"), (text) => {
  text = addImport(text, 'import VerifiedProfileCard from "@/components/VerifiedProfileCard";');

  if (text.includes("<VerifiedProfileCard")) return text;

  const insert = `
        <VerifiedProfileCard
          verified={Boolean((profile as any)?.verified || (profile as any)?.isVerified || (profile as any)?.verificationStatus === "approved")}
          isOwnProfile={false}
        />
`;

  const mainEnd = text.lastIndexOf("</main>");
  if (mainEnd !== -1) {
    return text.slice(0, mainEnd) + insert + text.slice(mainEnd);
  }

  return text;
});

console.log("Готово. Если какой-то файл не обновился автоматически — вставь компоненты вручную по README.");
