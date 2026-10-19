import { auth } from "./firebase";
import { getApiUrl } from "./getApiUrl";
import { normalizeRussianPhone } from "./phone";

export async function getProfilePhone(uid: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Войдите в аккаунт, чтобы позвонить.");

  const token = await user.getIdToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(getApiUrl("/api/profile/phone"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ uid }),
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (auth.currentUser?.uid !== user.uid) throw new Error("Войдите в аккаунт повторно.");
    if (!response.ok) {
      throw new Error(typeof body?.error === "string" ? body.error : "Не удалось получить номер телефона. Повторите попытку позже.");
    }
    const phone = normalizeRussianPhone(body?.phone);
    if (!phone) throw new Error("Пользователь не указал корректный номер телефона.");
    return phone;
  } finally {
    clearTimeout(timeout);
  }
}
