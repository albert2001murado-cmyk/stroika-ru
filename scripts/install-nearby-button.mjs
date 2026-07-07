import fs from "fs";
import path from "path";

const pagePath = path.join(process.cwd(), "src/app/page.tsx");

if (!fs.existsSync(pagePath)) {
  console.error("Не найден файл src/app/page.tsx");
  process.exit(1);
}

let text = fs.readFileSync(pagePath, "utf8");

if (!text.includes('NearbyWorkerButton')) {
  const importLine = 'import NearbyWorkerButton from "@/components/NearbyWorkerButton";\n';

  const lines = text.split("\n");
  let insertIndex = 0;

  if (lines[0]?.includes('"use client"') || lines[0]?.includes("'use client'")) {
    insertIndex = 1;
    if (lines[1]?.trim() === "") insertIndex = 2;
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].startsWith("import ")) {
      insertIndex = index + 1;
    }
  }

  lines.splice(insertIndex, 0, importLine.trimEnd());
  text = lines.join("\n");
}

if (!text.includes("<NearbyWorkerButton />")) {
  const firstSectionEnd = text.indexOf("</section>");

  if (firstSectionEnd !== -1) {
    const insertAt = firstSectionEnd + "</section>".length;
    text =
      text.slice(0, insertAt) +
      "\n\n      <NearbyWorkerButton />" +
      text.slice(insertAt);
  } else {
    const mainEnd = text.lastIndexOf("</main>");

    if (mainEnd !== -1) {
      text =
        text.slice(0, mainEnd) +
        "      <NearbyWorkerButton />\n" +
        text.slice(mainEnd);
    } else {
      console.error("Не смог найти место для вставки кнопки. Вставь вручную: <NearbyWorkerButton />");
      process.exit(1);
    }
  }
}

fs.writeFileSync(pagePath, text, "utf8");

console.log("Готово: кнопка Исполнитель рядом добавлена в src/app/page.tsx");
