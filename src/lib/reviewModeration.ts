import { auth } from "./firebase";

export async function requestReviewModeration(reviewId: string) {
  const user = auth.currentUser;
  if (!user || !reviewId) return { queued: false } as const;
  try {
    const token = await user.getIdToken();
    const response = await fetch("/api/moderation/reviews/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reviewId }),
    });
    return { queued: response.ok } as const;
  } catch {
    return { queued: false } as const;
  }
}
