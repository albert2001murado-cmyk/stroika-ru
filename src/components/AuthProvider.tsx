"use client";
import { usePathname } from "next/navigation";

import { ContactRequestError, contactRequest } from "@/lib/contact-request";
import { checkAccountSession, securityLogin, securityRequest } from "@/lib/accountSecurityClient";
import { observeAccountSession, type SessionIssue } from "@/lib/accountSessionObserver";
import { auth, db } from "@/lib/firebase";
import type { AccountType, UserProfile } from "@/types";
import {
  User,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  onIdTokenChanged,
  sendPasswordResetEmail,
  setPersistence,
  signOut,
} from "firebase/auth";
import { doc, onSnapshot } from "@/lib/database/client";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type RegisterData = {
  email: string;
  password: string;
  displayName: string;
  accountType: AccountType;
  companyInn?: string;
  city?: string;
  phone?: string;
};

type AuthContextValue = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  register: (data: RegisterData) => Promise<void>;
  login: (identifier: string, password: string, remember?: boolean, method?: "email" | "phone") => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const [sessionIssue, setSessionIssue] = useState<SessionIssue | null>(null);
  const retryRef = useRef<() => void>(() => undefined);

  const pendingRegistration = useRef<{ user: User; email: string } | null>(null);

  async function register(data: RegisterData) {
    const normalizedEmail = data.email.trim().toLocaleLowerCase("en-US");
    const pending = pendingRegistration.current?.email === normalizedEmail && auth.currentUser?.uid === pendingRegistration.current.user.uid
      ? pendingRegistration.current.user : undefined;
    await contactRequest("/api/registration/check-phone", { phone: data.phone }, pending);
    const registeredUser = pending || (await createUserWithEmailAndPassword(auth, normalizedEmail, data.password)).user;
    pendingRegistration.current = { user: registeredUser, email: normalizedEmail };
    try {
      const business = data.accountType === "ip" || data.accountType === "ooo";
      const result = await contactRequest(business ? "/api/register-business" : "/api/registration/profile", {
        accountType: data.accountType, inn: data.companyInn, representativeName: data.displayName,
        displayName: data.displayName, city: data.city, phone: data.phone,
      }, registeredUser);
      await registeredUser.reload().catch(() => undefined);
      pendingRegistration.current = null;
      if (auth.currentUser?.uid === registeredUser.uid) {
        setUser(auth.currentUser);
        setProfile(result.profile as UserProfile);
      }
    } catch (error) {
      // A lost response may follow a successful commit: never delete on an uncertain result.
      if (error instanceof ContactRequestError && error.notCommitted && error.status >= 400 && error.status < 500) {
        try { await deleteUser(registeredUser); pendingRegistration.current = null; }
        catch { /* Preserve the original, actionable registration error. */ }
      }
      throw error;
    }
  }

  async function login(identifier: string, password: string, remember = true, method: "email" | "phone" = "email") {
    await setPersistence(
      auth,
      remember ? browserLocalPersistence : browserSessionPersistence
    );
    await securityLogin(identifier.trim(), password, remember, method);
  }

  async function resetPassword(email: string) {
    auth.languageCode = "ru";
    await sendPasswordResetEmail(
      auth,
      email.trim().toLocaleLowerCase("en-US")
    );
  }

  async function logout() {
    if (auth.currentUser) await securityRequest("logout", {}, auth.currentUser, { timeoutMs: 5_000 }).catch(() => undefined);
    await signOut(auth);
    setUser(null);
    setProfile(null);
  }

  useEffect(() => {
    const observer = observeAccountSession<User, UserProfile>({
      verify: async (currentUser, _forceRefresh, signal) => { await checkAccountSession(currentUser, { signal }); },
      isCurrent: currentUser => auth.currentUser === currentUser,
      clearPrivateCaches: () => undefined,
      publish: state => {
        setUser(state.user); setProfile(state.profile); setSessionIssue(state.sessionIssue);
        setLoading(state.loading || Boolean(state.user && !state.profileReady));
      },
      watchProfile: (currentUser, next, fail) => onSnapshot(doc(db, "users", currentUser.uid),
        { includeMetadataChanges: true },
        snapshot => next(snapshot.exists() ? { ...snapshot.data(), uid: snapshot.id } as UserProfile : null, snapshot.metadata.fromCache),
        error => fail(error.code === "permission-denied" || error.code === "unauthenticated")),
    });
    retryRef.current = () => { void observer.retry(); };
    const unsubscribeAuth = onIdTokenChanged(auth, currentUser => observer.onUser(currentUser));
    const resume = () => { if (document.visibilityState === "visible") observer.resume(); };
    const online = () => observer.resume();
    window.addEventListener("focus", resume);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", resume);
    const retry = window.setInterval(() => {
      if (document.visibilityState === "visible") observer.retryUnavailable();
    }, 20_000);
    return () => {
      unsubscribeAuth(); observer.dispose(); retryRef.current = () => undefined;
      window.clearInterval(retry);
      window.removeEventListener("focus", resume); window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, profile, loading, register, login, resetPassword, logout }),
    [user, profile, loading]
  );

  const blocked = sessionIssue === "blocked";
  const reauthenticate = sessionIssue === "reauthenticate";
  const showNotice = Boolean(sessionIssue && !user && pathname !== "/delete-account");
  return <AuthContext.Provider value={value}>{showNotice ? (
    <main className="mx-auto max-w-md px-5 py-20">
      <h1 className="text-2xl font-black">{blocked ? "Доступ к аккаунту ограничен" : reauthenticate ? "Нужно войти заново" : "Не удалось проверить сохранённый вход"}</h1>
      <p role="alert" className="mt-4 leading-7 text-slate-600">{blocked ? "Обратитесь в поддержку, если считаете, что это ошибка" : reauthenticate ? "Срок действия сессии истёк или она была отозвана" : "Сервис временно не отвечает. Сохранённый вход не удалён. Повторим проверку автоматически"}</p>
      {!blocked && !reauthenticate ? <button onClick={() => retryRef.current()} className="mt-6 rounded-2xl bg-blue-600 px-5 py-4 font-bold text-white">Повторить проверку</button> : null}
      <button onClick={() => void logout().then(() => window.location.assign("/auth"))} className="mt-3 block p-3 font-bold text-blue-600">{reauthenticate ? "Войти заново" : "Сменить аккаунт"}</button>
    </main>
  ) : <>
    {sessionIssue === "unavailable" && user ? <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-slate-700">Не удалось обновить вход. Повторим проверку автоматически <button onClick={() => retryRef.current()} className="ml-2 font-bold text-blue-600">Повторить</button></div> : null}
    {children}
  </>}</AuthContext.Provider>;

}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth должен использоваться внутри AuthProvider");
  }
  return context;
}
