export class ContactRequestError extends Error {
  constructor(message: string, public code: string, public notCommitted: boolean, public status = 0) { super(message); }
}
type TokenUser = { getIdToken(forceRefresh?: boolean): Promise<string> };
/** Registration finalizers are idempotent, so an uncertain network reply can be retried. */
export async function contactRequest(url: string, body: Record<string, unknown>, user?: TokenUser) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const token = user ? await user.getIdToken() : "";
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new ContactRequestError(payload.error || "Не удалось проверить данные.", payload.code || "registration/unavailable", payload.notCommitted === true, response.status);
      return payload;
    } catch (error) {
      if (error instanceof ContactRequestError && (error.status < 500 || attempt === 1)) throw error;
      if (attempt === 1) throw new ContactRequestError("Не удалось получить подтверждение. Повторите попытку или войдите в аккаунт.", "registration/connection", false);
    }
  }
  throw new ContactRequestError("Повторите попытку.", "registration/connection", false);
}
