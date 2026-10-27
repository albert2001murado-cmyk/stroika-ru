import { auth } from "./firebase";
type TokenUser = {
  uid: string;
  getIdToken(forceRefresh?: boolean): Promise<string>;
};
export async function verificationApi<T>(
  user: TokenUser,
  url: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 20_000);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (auth.currentUser?.uid !== user.uid)
        throw new Error("Аккаунт изменился. Откройте раздел повторно.");
      const token = await user.getIdToken(attempt === 1);
      if (auth.currentUser?.uid !== user.uid)
        throw new Error("Аккаунт изменился. Откройте раздел повторно.");
      const response = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.status === 401 && attempt === 0) continue;
      const value = await response.json().catch(() => null);
      if (!response.ok || !value)
        throw new Error(
          value?.error ||
            (response.status === 404
              ? "Обновите сервер сайта: раздел проверки аккаунта пока недоступен."
              : "Не удалось выполнить действие. Повторите запрос."),
        );
      if (auth.currentUser?.uid !== user.uid)
        throw new Error("Аккаунт изменился. Откройте раздел повторно.");
      return value as T;
    }
    throw new Error("Войдите в аккаунт снова.");
  } catch (error) {
    if (
      (error as { name?: string })?.name === "AbortError" ||
      error instanceof TypeError
    )
      throw new Error(
        "Не удалось связаться с сервером. Проверьте интернет и повторите.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
