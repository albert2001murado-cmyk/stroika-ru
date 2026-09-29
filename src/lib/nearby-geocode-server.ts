import { publicationAddress, validMatchPoint, type MatchPoint, type MatchPublication } from "./nearby-match-policy";

// Bounded, process-local cache. No new publicly readable location collection.
const cache = new Map<string, { expires: number; point: MatchPoint | null }>();
const inFlight = new Map<string, Promise<MatchPoint | null>>();

export function exactPointFromGeocoder(data: any): MatchPoint | null {
  const object = data?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;
  const meta = object?.metaDataProperty?.GeocoderMetaData;
  if (meta?.kind !== "house" || meta?.precision !== "exact") return null;
  const pos = typeof object?.Point?.pos === "string" ? object.Point.pos.trim().split(/\s+/) : [];
  if (pos.length !== 2 || pos.some((value: string) => value === "")) return null;
  const point = { lng: Number(pos[0]), lat: Number(pos[1]) };
  return validMatchPoint(point) ? point : null;
}

export async function resolveNearbyPoint(data: MatchPublication): Promise<MatchPoint | null> {
  const address = publicationAddress(data);
  if (!address) return null;
  const cached = cache.get(address);
  if (cached && cached.expires > Date.now()) return cached.point;
  const pending = inFlight.get(address);
  if (pending) return pending;

  const work = (async () => {
    const key = (process.env.YANDEX_GEOCODER_API_KEY || process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY || "").trim();
    if (!key) throw new Error("Nearby matching requires YANDEX_GEOCODER_API_KEY");
    const url = new URL("https://geocode-maps.yandex.ru/1.x/");
    url.search = new URLSearchParams({ apikey: key, geocode: address, format: "json", lang: "ru_RU", results: "1" }).toString();
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    // Temporary failures leave the notification job pending, rather than silently
    // completing it without recipients. Do not log API keys or private addresses.
    if (!response.ok) throw new Error(`Nearby geocoder unavailable (${response.status})`);
    const point = exactPointFromGeocoder(await response.json());
    if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
    cache.set(address, { point, expires: Date.now() + (point ? 3600000 : 300000) });
    return point;
  })();
  inFlight.set(address, work);
  try { return await work; } finally { inFlight.delete(address); }
}
