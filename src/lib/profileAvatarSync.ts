import { auth } from "@/lib/firebase";
import { getApiUrl } from "@/lib/getApiUrl";

export async function syncSavedProfileAvatar() {
  const user = auth.currentUser;
  if (!user) return { synced: false, queued: false };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const token = await user.getIdToken();
    const response = await fetch(getApiUrl("/api/profile/avatar-sync"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!response.ok) return { synced: false, queued: false };
    const data = await response.json();
    return { synced: data.ok === true && !data.pending, queued: data.ok === true };
  } catch {
    // Never turn a successful profile save into a false "save failed" alert.
    return { synced: false, queued: false };
  } finally {
    clearTimeout(timeout);
  }
}

