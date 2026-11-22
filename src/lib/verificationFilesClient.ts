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
    timer = setTimeout(() => controller.abort(), 120_000);
  let handedOff = false;
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
      const read = async <T,>(consume: () => Promise<T>) => {
        try { sameAccount(); const value = await consume(); sameAccount(); return value; }
        catch (error) {
          if (controller.signal.aborted) throw new Error("Передача файла заняла слишком много времени. Проверьте соединение и повторите");
          throw error;
        } finally { clearTimeout(timer); }
      };
      handedOff = true;
      return {
        json: () => read(() => response.json()),
        arrayBuffer: () => read(() => response.arrayBuffer()),
        blob: () => read(() => response.blob()),
      };
    }
    throw new Error("Войдите в аккаунт снова.");
  } catch (error) {
    if ((error as Error)?.name === "AbortError" || error instanceof TypeError)
      throw new Error(
        "Не удалось передать файл. Проверьте интернет и повторите.",
      );
    throw error;
  } finally {
    if (!handedOff) clearTimeout(timer);
  }
}
