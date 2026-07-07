import fs from "fs";
import path from "path";

const filePath = path.join(process.cwd(), "src/app/moderator/verification/page.tsx");

if (!fs.existsSync(filePath)) {
  console.error("Не найден файл src/app/moderator/verification/page.tsx");
  process.exit(1);
}

let text = fs.readFileSync(filePath, "utf8");

if (text.includes("authorVerified")) {
  console.log("Поля verified для объявлений уже добавлены.");
  process.exit(0);
}

text = text.replaceAll(
  `verified,
              isVerified: verified,
              verifiedAt: verified ? serverTimestamp() : null,`,
  `verified,
              isVerified: verified,
              authorVerified: verified,
              userVerified: verified,
              profileVerified: verified,
              verificationStatus: verified ? "approved" : "rejected",
              verifiedAt: verified ? serverTimestamp() : null,`
);

fs.writeFileSync(filePath, text, "utf8");
console.log("Готово: модераторская страница теперь пишет verified в объявления шире.");
