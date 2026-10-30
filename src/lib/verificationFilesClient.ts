import { auth } from "./firebase";
export type VerificationFileUser = {
  uid: string;
  getIdToken(force?: boolean): Promise<string>;
};
export async function verificationFileRequest(
  user: VerificationFileUser,
  url: string,
  options: { method?: string; body?: FormData } = {},
) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 60_000);
  function sameAccount() {
    if (auth.currentUser?.uid !== user.uid)
      throw new Error("Аккаунт изменился. Откройте раздел повторно.");
  }
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      sameAccount();
      const token = await user.getIdToken(attempt === 1);
      sameAccount();
      const response = await fetch(url, {
        ...options,
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.status === 401 && attempt === 0) continue;
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(
          error?.error || "Не удалось загрузить файл. Повторите.",
        );
      }
      sameAccount();
      const bytes = await response.arrayBuffer();
      sameAccount();
      return new Response(bytes, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
    throw new Error("Войдите в аккаунт снова.");
  } catch (error) {
    if ((error as Error)?.name === "AbortError" || error instanceof TypeError)
      throw new Error(
        "Не удалось передать файл. Проверьте интернет и повторите.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
