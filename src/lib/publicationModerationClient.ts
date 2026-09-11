import { auth } from "@/lib/firebase";
import { getApiUrl } from "@/lib/getApiUrl";

export type PublicationKind = "listing" | "request";

export async function requestPublicationModeration(
  kind: PublicationKind,
  publicationId: string
) {
  const user = auth.currentUser;
  if (!user || !publicationId) return { queued: false } as const;

  try {
    const token = await user.getIdToken();
    const response = await fetch(getApiUrl("/api/moderation/submit"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ kind, publicationId }),
      keepalive: true,
    });
    return { queued: response.ok } as const;
  } catch {
    // Минутный серверный обработчик подхватит pending-публикацию.
    return { queued: false } as const;
  }
}
