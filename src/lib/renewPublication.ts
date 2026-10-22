import { auth } from "./firebase";
import { getApiUrl } from "./getApiUrl";
import { requestPublicationModeration } from "./publicationModerationClient";

export type PublicationKind = "listing" | "request";
export type PublicationRenewalResult = {
  kind: PublicationKind; publicationId: string; alreadyRenewed: boolean;
  createdAt: number; expiresAt: number; renewalCount: number; moderationStatus: string;
};

export async function renewPublication(kind: PublicationKind, publicationId: string, expectedExpiresAt: number): Promise<PublicationRenewalResult> {
  const user = auth.currentUser;
  if (!user) throw new Error("Войдите в аккаунт для повторной публикации.");
  const token = await user.getIdToken();
  if (auth.currentUser?.uid !== user.uid) throw new Error("Войдите в аккаунт повторно.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(getApiUrl("/api/publications/renew"), {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ kind, publicationId, expectedExpiresAt }),
      credentials: "omit", cache: "no-store", redirect: "error", signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (auth.currentUser?.uid !== user.uid) throw new Error("Войдите в аккаунт повторно.");
    if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Не удалось отправить объявление на публикацию.");
    if (body?.kind !== kind || body?.publicationId !== publicationId || !Number.isFinite(body?.createdAt) || !Number.isFinite(body?.expiresAt) || body.expiresAt <= body.createdAt || !Number.isFinite(body?.renewalCount) || typeof body?.moderationStatus !== "string") {
      throw new Error("Не удалось подтвердить новый срок. Обновите профиль.");
    }
    if (body.moderationStatus === "pending") void requestPublicationModeration(kind, publicationId);
    return body as PublicationRenewalResult;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Сервер отвечает дольше обычного. Обновите профиль перед повторной попыткой.");
    throw error;
  } finally { clearTimeout(timer); }
}
