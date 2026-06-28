// server.js
// Правильный запуск Next.js на VPS, когда в next.config.ts стоит output: "standalone".
// После npm run build запускаем именно .next/standalone/server.js, а не next start.

const path = require("path");
const fs = require("fs");

process.env.NODE_ENV = "production";
process.env.PORT = process.env.PORT || "3000";
process.env.HOSTNAME = process.env.HOSTNAME || "0.0.0.0";

const standaloneServer = path.join(__dirname, ".next", "standalone", "server.js");

if (!fs.existsSync(standaloneServer)) {
  console.error("");
  console.error("❌ Не найден файл .next/standalone/server.js");
  console.error("Сначала выполни: npm run build");
  console.error("");
  process.exit(1);
}

require(standaloneServer);
