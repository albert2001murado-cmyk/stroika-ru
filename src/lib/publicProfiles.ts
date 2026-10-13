import type { DocumentData } from "firebase/firestore";
import { getApiUrl } from "./getApiUrl";

export type PublicProfileSnapshot = {
  id: string;
  exists(): boolean;
  data(): DocumentData;
};
function snapshot(id: string, data: DocumentData | null): PublicProfileSnapshot {
  return { id, exists: () => data !== null, data: () => data || {} };
}
export async function getPublicProfile(uid: string): Promise<PublicProfileSnapshot> {
  const response: Response = await fetch(getApiUrl(`/api/public-profile?uid=${encodeURIComponent(uid)}`), { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (response.status === 404) return snapshot(uid, null);
  if (!response.ok) throw new Error("Не удалось загрузить публичный профиль.");
  const body = await response.json();
  return snapshot(uid, body.profile || null);
}
export function watchPublicProfile(uid: string, onNext: (value: PublicProfileSnapshot) => void, onError?: (error: unknown) => void) {
  let active = true;
  let running = false;
  const refresh = async () => {
    if (!active || running) return;
    running = true;
    try { const value = await getPublicProfile(uid); if (active) onNext(value); }
    catch (error) { if (active) onError?.(error); }
    finally { running = false; }
  };
  void refresh();
  const timer = setInterval(() => void refresh(), 60_000);
  return () => { active = false; clearInterval(timer); };
}
export async function getPublicProfiles() {
  const docs: PublicProfileSnapshot[] = [];
  let cursor: string | null = null;
  do {
    const response: Response = await fetch(getApiUrl(`/api/public-profiles${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`), { signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (!response.ok) throw new Error("Не удалось загрузить публичные профили.");
    const body: { profiles: DocumentData[]; cursor: string | null } = await response.json();
    docs.push(...body.profiles.map((item: DocumentData) => snapshot(item.uid, item)));
    cursor = body.cursor;
  } while (cursor);
  return { docs };
}
