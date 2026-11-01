import { auth, db } from "./firebase";
import { collection, doc } from "firebase/firestore";
import { getApiUrl } from "./getApiUrl";
export class AccountRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code = "") { super(message); }
}
export let accountMutationRevision = 0;
export function newAccountRequestId() { return doc(collection(db, "_requestIds")).id; }
export async function accountRequest<T = any>(path: string, body?: unknown): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new AccountRequestError("Войдите в аккаунт", 401);
  const token = await user.getIdToken();
  if (auth.currentUser?.uid !== user.uid) throw new AccountRequestError("Аккаунт изменился. Повторите вход", 401);
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(getApiUrl(path), { method: body === undefined ? "GET" : "POST", credentials: "omit", cache: "no-store", redirect: "error", signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json().catch(() => null);
    if (auth.currentUser?.uid !== user.uid) throw new AccountRequestError("Аккаунт изменился. Повторите вход", 401);
    if (!response.ok) throw new AccountRequestError(typeof data?.error === "string" ? data.error : "Действие не выполнено. Повторите позже", response.status, data?.code);
    if (body !== undefined && /^\/api\/(?:billing|publications)\//.test(path)) accountMutationRevision++;
    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new AccountRequestError("Ответ задерживается. Проверьте результат перед повторной попыткой", 408);
    throw error;
  } finally { clearTimeout(timer); }
}
export function createAccountPublication(kind: "listing" | "request", publication: unknown, requestId: string) {
  return accountRequest<{ id: string; kind: "listing" | "request" }>("/api/publications/create", { kind, publication, requestId });
}
