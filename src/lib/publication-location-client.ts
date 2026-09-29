import { getApiUrl } from "./getApiUrl";

export async function geocodePublicationLocation(city: string, street: string) {
  const address = [city.trim(), street.trim()].filter(Boolean).join(", ");
  if (!address) return null;
  try {
    const response = await fetch(getApiUrl(`/api/geocode?address=${encodeURIComponent(address)}`), {
      signal: AbortSignal.timeout(6000),
    });
    const data = await response.json();
    if (!response.ok || typeof data?.lat !== "number" || typeof data?.lng !== "number" ||
        !Number.isFinite(data.lat) || !Number.isFinite(data.lng)) return null;
    // Used by the map. Nearby matching independently checks geocoder precision
    // on the server and never uses a city-only result for distance notifications.
    return { lat: data.lat, lng: data.lng, address: String(data.address || address) };
  } catch { return null; }
}
