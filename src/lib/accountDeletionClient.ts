"use client";
import { collection, doc } from '@/lib/database/client';
import { auth, db } from './firebase';
import { getApiUrl } from './getApiUrl';

export const DELETION_STORAGE_KEY = 'strova.account-deletion.v1';
export type DeletionState = 'pending' | 'retrying' | 'completed' | 'unconfirmed';
export const newDeletionReceipt = () => doc(collection(db, '_requestIds')).id + doc(collection(db, '_requestIds')).id;
export class DeletionClientError extends Error { constructor(message: string, public code = '') { super(message); } }
async function request(receipt: string, body?: { password: string; code: string }) {
  const user = auth.currentUser;
  if (body && !user) throw new DeletionClientError('Войдите в аккаунт, чтобы подтвердить удаление');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function send() {
    const token = body ? await user!.getIdToken() : '';
    if (controller.signal.aborted) throw new Error('timeout');
    if (body && auth.currentUser?.uid !== user?.uid) throw new DeletionClientError('Аккаунт изменился. Повторите вход');
    const response = await fetch(getApiUrl('/api/account/delete'), {
      method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal,
      headers: { Accept: 'application/json', 'X-Strova-Deletion-Receipt': receipt, ...(body ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify({ ...body, receipt, confirm: 'DELETE' }) } : {}),
    });
    if (response.headers.get('x-strova-deletion-protocol') !== '1' || !response.headers.get('content-type')?.includes('application/json')) throw new DeletionClientError('Сервер не подтвердил удаление. Повторите проверку позже');
    const data = await response.json();
    if (!body && response.status === 404 && data.code === 'deletion/not-found') return 'unconfirmed' as const;
    if (!response.ok) throw new DeletionClientError(typeof data.error === 'string' ? data.error : 'Не удалось выполнить запрос', data.code);
    if (!['pending', 'retrying', 'completed'].includes(data.status)) throw new DeletionClientError('Сервер не подтвердил результат. Повторите проверку');
    return data.status as DeletionState;
  }
  try {
    return await Promise.race([send(), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, 25_000); })]);
  } catch (error) {
    if (error instanceof DeletionClientError) throw error;
    throw new DeletionClientError('Ответ сервера задерживается. Запрос мог быть принят, проверьте статус удаления');
  } finally { if (timer) clearTimeout(timer); }
}
export const requestAccountDeletion = (receipt: string, password: string, code: string) => request(receipt, { password, code });
export const getAccountDeletionStatus = (receipt: string) => request(receipt);
export const DELETION_STATUS_TEXT: Record<DeletionState, string> = {
  unconfirmed: 'Подтверждение запроса ещё не получено. Проверьте статус или повторите отправку',
  pending: 'Запрос принят. Удаляем данные и завершаем активные сеансы. Можно закрыть эту страницу',
  retrying: 'Удаление ещё не завершено. Запрос сохранён, сервис повторит очистку автоматически',
  completed: 'Аккаунт и связанные с ним данные удалены из сервиса',
};
