import { auth } from "./firebase";

export async function uploadAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error("Войдите в аккаунт, чтобы загрузить файл.");
  return { Authorization: `Bearer ${await user.getIdToken()}`, Accept: "application/json" };
}
