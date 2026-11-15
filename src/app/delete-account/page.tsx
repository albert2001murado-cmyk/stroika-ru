"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { ArrowLeft, CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { ACCOUNT_DELETION_ITEMS, COMPANY } from '@/lib/company-details';
import { DELETION_STATUS_TEXT, DELETION_STORAGE_KEY, DeletionClientError, getAccountDeletionStatus, newDeletionReceipt, requestAccountDeletion, type DeletionState } from '@/lib/accountDeletionClient';

export default function DeleteAccountPage() {
  const [user, setUser] = useState<User | null>(null), [receipt, setReceipt] = useState('');
  const [status, setStatus] = useState<DeletionState | null>(null);
  const [password, setPassword] = useState(''), [code, setCode] = useState(''), [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const checking = useRef(false), requestedUid = useRef('');
  const usesPassword = user?.providerData.some(p => p.providerId === 'password') ?? true;
  useEffect(() => {
    try { const saved = localStorage.getItem(DELETION_STORAGE_KEY); if (saved && /^[A-Za-z0-9]{40}$/.test(saved)) setReceipt(saved); }
    catch { setError('Разрешите хранение данных сайта, чтобы сохранить статус удаления'); }
    return onAuthStateChanged(auth, setUser);
  }, []);
  async function check(id = receipt) {
    if (!id || checking.current) return;
    checking.current = true;
    try {
      const next = await getAccountDeletionStatus(id); setStatus(next);
      if (next !== 'unconfirmed') {
        setError('');
        if (requestedUid.current && auth.currentUser?.uid === requestedUid.current) await signOut(auth);
      }
    } catch (e) { setError((e as Error).message); }
    finally { checking.current = false; }
  }
  useEffect(() => {
    if (!receipt || status === 'completed') return;
    void check(receipt); const timer = setInterval(() => void check(receipt), 15_000); return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt, status === 'completed']);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy || !confirm || usesPassword && !password || !user) return;
    setBusy(true); setError('');
    const id = receipt || newDeletionReceipt(), uid = user.uid; requestedUid.current = uid;
    try {
      localStorage.setItem(DELETION_STORAGE_KEY, id); setReceipt(id);
      setStatus(await requestAccountDeletion(id, password, code)); setPassword(''); setCode('');
      if (auth.currentUser?.uid === uid) await signOut(auth);
    } catch (e) {
      setError((e as Error).message);
      if (!(e instanceof DeletionClientError) || !e.code.startsWith('auth/')) void check(id);
    } finally { setBusy(false); }
  }
  function reset() {
    localStorage.removeItem(DELETION_STORAGE_KEY); requestedUid.current = '';
    setReceipt(''); setStatus(null); setConfirm(false); setPassword(''); setCode(''); setError('');
  }
  const accepted = status && status !== 'unconfirmed';
  return <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
    <Link href="/profile" className="inline-flex items-center gap-2 font-bold text-blue-600"><ArrowLeft size={18}/>В профиль</Link>
    <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-9">
      <span className="inline-flex rounded-2xl bg-red-50 p-3 text-red-600"><Trash2 size={28}/></span>
      <h1 className="mt-5 text-3xl font-black text-slate-950">Удаление аккаунта Стровы</h1>
      <p className="mt-4 leading-7 text-slate-600">Аккаунт удалится с сайта и из приложения. После подтверждения отменить удаление и восстановить данные нельзя</p>
      <ul className="my-6 space-y-3 text-sm leading-6 text-slate-700">{ACCOUNT_DELETION_ITEMS.map(item => <li key={item} className="flex gap-3"><CheckCircle2 size={18} className="mt-1 shrink-0 text-slate-400"/>{item}</li>)}</ul>
      <p className="text-sm leading-6 text-slate-600">Сообщения других участников групп сохранятся. Если вы владелец группы, управление перейдёт оставшемуся участнику</p>
      <p className="mt-3 text-sm leading-6 text-slate-600">Для завершения старых сеансов сервер ждёт 65 минут. Очистка продолжится после закрытия страницы. При сбое сервис повторит удаление, статус будет доступен здесь</p>
      {status && <div role="status" className="mt-6 rounded-2xl bg-blue-50 p-5 leading-7 text-blue-950">{DELETION_STATUS_TEXT[status]}</div>}
      {!accepted && (user ? <form onSubmit={submit} className="mt-7 space-y-5">
        {usesPassword && <label className="block text-sm font-bold">Текущий пароль<input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-3"/></label>}
        <label className="block text-sm font-bold">Код аутентификатора, если включён двухэтапный вход<input autoComplete="one-time-code" value={code} maxLength={48} onChange={e => setCode(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-3"/><span className="mt-2 block text-xs font-normal text-slate-500">Подойдёт также резервный код</span></label>
        <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-red-600"/>Я понимаю, что аккаунт, мои публикации и личные диалоги будут удалены без возможности восстановления</label>
        <button disabled={busy || usesPassword && !password || !confirm} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-4 font-bold text-white disabled:opacity-40">{busy && <Loader2 className="animate-spin" size={18}/>} {busy ? 'Отправляем подтверждение' : 'Удалить аккаунт навсегда'}</button>
      </form> : <Link href="/auth?next=/delete-account" className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 font-bold text-white">Войти для удаления аккаунта</Link>)}
      {receipt && status !== 'completed' && <button onClick={() => void check()} className="mt-5 rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-700">Проверить статус</button>}
      {status === 'completed' && user && <button onClick={reset} className="mt-4 block font-bold text-blue-600">Удалить текущий аккаунт</button>}
      {error && <p role="alert" className="mt-4 text-sm leading-6 text-red-700">{error}</p>}
      <p className="mt-7 border-t border-slate-100 pt-5 text-sm leading-6 text-slate-600">Нет доступа к аккаунту? Напишите на <a className="text-blue-600 underline" href={`mailto:${COMPANY.email}?subject=${encodeURIComponent('Удаление аккаунта Стровы')}`}>{COMPANY.email}</a> с темой «Удаление аккаунта Стровы» и укажите почту или телефон аккаунта. Пароль и одноразовые коды не присылайте</p>
      <p className="mt-4 text-sm leading-6 text-slate-500">Сведения о резервных копиях и переписке с поддержкой приведены в <Link href="/privacy#deletion" className="text-blue-600 underline">Политике конфиденциальности</Link></p>
    </section>
  </main>;
}
