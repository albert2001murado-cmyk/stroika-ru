import fs from "fs";
import https from "https";
import path from "path";

const envPath = path.join(process.cwd(), ".env.local");

function parseEnv(text) {
  const env = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) continue;

    const index = line.indexOf("=");
    if (index === -1) continue;

    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function mask(value) {
  if (!value) return "НЕТ";
  if (value.length <= 12) return `${value} | длина=${value.length}`;
  return `${value.slice(0, 6)}...${value.slice(-6)} | длина=${value.length}`;
}

function requestJson(url) {
  return new Promise((resolve) => {
    https
      .get(url, (res) => {
        let body = "";

        res.on("data", (chunk) => {
          body += chunk;
        });

        res.on("end", () => {
          resolve({
            status: res.statusCode,
            body,
          });
        });
      })
      .on("error", (error) => {
        resolve({
          status: 0,
          body: String(error),
        });
      });
  });
}

if (!fs.existsSync(envPath)) {
  console.log("ОШИБКА: .env.local не найден");
  console.log("Путь:", envPath);
  process.exit(1);
}

const envText = fs.readFileSync(envPath, "utf8");
const env = parseEnv(envText);

const mapKey = env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY || "";
const geocoderKey = env.YANDEX_GEOCODER_API_KEY || "";
const key = geocoderKey || mapKey;

console.log("");
console.log("ПРОВЕРКА .env.local");
console.log("-------------------");
console.log("NEXT_PUBLIC_YANDEX_MAPS_API_KEY:", mask(mapKey));
console.log("YANDEX_GEOCODER_API_KEY:", mask(geocoderKey));

if (!key) {
  console.log("");
  console.log("ОШИБКА: ключи не найдены.");
  console.log("В .env.local должны быть строки:");
  console.log("NEXT_PUBLIC_YANDEX_MAPS_API_KEY=ключ_карты");
  console.log("YANDEX_GEOCODER_API_KEY=ключ_геокодера");
  process.exit(1);
}

const address = "Нижний Новгород, ул. Ильинская, 37";
const url = new URL("https://geocode-maps.yandex.ru/1.x/");
url.searchParams.set("apikey", key);
url.searchParams.set("geocode", address);
url.searchParams.set("format", "json");
url.searchParams.set("lang", "ru_RU");
url.searchParams.set("results", "1");

console.log("");
console.log("ПРОВЕРЯЮ ГЕОКОДЕР ЯНДЕКСА...");
console.log("Адрес:", address);

const result = await requestJson(url.toString());

console.log("");
console.log("HTTP status:", result.status);

let data = null;

try {
  data = JSON.parse(result.body);
} catch {
  console.log("Ответ не JSON:");
  console.log(result.body.slice(0, 500));
  process.exit(1);
}

if (result.status !== 200) {
  console.log("ОШИБКА ОТ ЯНДЕКСА:");
  console.log(JSON.stringify(data, null, 2).slice(0, 1000));
  console.log("");
  console.log("Что это значит:");
  console.log("403 / Invalid key — ключ не от Геокодера, не активирован или запрещён по ограничениям.");
  console.log("Подожди 15 минут после создания ключа или создай ключ именно для API Геокодера.");
  process.exit(1);
}

const geoObject =
  data?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;

const pos = geoObject?.Point?.pos;

if (!pos) {
  console.log("Ключ рабочий, но координаты не найдены.");
  console.log(JSON.stringify(data, null, 2).slice(0, 1000));
  process.exit(1);
}

const [lngRaw, latRaw] = String(pos).split(" ");

console.log("");
console.log("ГОТОВО: Геокодер работает.");
console.log("lat:", latRaw);
console.log("lng:", lngRaw);
console.log("address:", geoObject?.metaDataProperty?.GeocoderMetaData?.text || address);
console.log("");
console.log("Теперь перезапусти сайт:");
console.log("npm run dev");
