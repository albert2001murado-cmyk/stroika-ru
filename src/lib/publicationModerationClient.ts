import { auth } from "./firebase";
import { getApiUrl } from "./getApiUrl";
export async function requestPublicationModeration(kind: "listing" | "request", publicationId: string) {
  const user = auth.currentUser;
  if (!user || !publicationId) return { queued: false } as const;
  try {
    const token = await user.getIdToken();
    if (auth.currentUser?.uid !== user.uid) return { queued: false } as const;
    const response = await fetch(getApiUrl("/api/moderation/submit"), { method: "POST", redirect: "error", credentials: "omit", signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ kind, publicationId }) });
    return { queued: response.ok } as const;
  } catch { return { queued: false } as const; } // The existing moderation cron also picks up pending publications.
}
