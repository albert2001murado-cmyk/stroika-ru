import fs from "fs";
import path from "path";

const headerPath = path.join(process.cwd(), "src/components/Header.tsx");

if (!fs.existsSync(headerPath)) {
  console.log("Header.tsx не найден. Добавь ссылку вручную: /verification");
  process.exit(0);
}

let text = fs.readFileSync(headerPath, "utf8");

if (text.includes('href="/verification"')) {
  console.log("Ссылка /verification уже есть.");
  process.exit(0);
}

const link = `
          <Link
            href="/verification"
            className="hidden items-center gap-2 rounded-2xl bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/20 xl:inline-flex"
          >
            Проверка
          </Link>
`;

const supportIndex = text.indexOf('href="/support"');
const beforeSupport = supportIndex === -1 ? -1 : text.lastIndexOf("<Link", supportIndex);

if (beforeSupport !== -1) {
  text = text.slice(0, beforeSupport) + link + text.slice(beforeSupport);
  fs.writeFileSync(headerPath, text, "utf8");
  console.log("Готово: ссылка Проверка добавлена перед Поддержкой.");
} else {
  console.log("Не нашёл место в Header. Добавь вручную: <Link href=\"/verification\">Проверка</Link>");
}
