"use client";

import { ContactRequestError, contactRequest } from "@/lib/contact-request";
import { checkAccountSession, securityLogin, securityRequest } from "@/lib/accountSecurityClient";
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
import { doc, onSnapshot } from "firebase/firestore";
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
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionProblem, setSessionProblem] = useState("");
  const [sessionRetry, setSessionRetry] = useState(0);

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

  async function login(email: string, password: string, remember = true) {
    await setPersistence(
      auth,
      remember ? browserLocalPersistence : browserSessionPersistence
    );
    await securityLogin(email.trim().toLocaleLowerCase("en-US"), password, remember);
  }

  async function resetPassword(email: string) {
    auth.languageCode = "ru";
    await sendPasswordResetEmail(
      auth,
      email.trim().toLocaleLowerCase("en-US")
    );
  }

  async function logout() {
    if (auth.currentUser) await securityRequest("logout", {}, auth.currentUser).catch(() => undefined);
    await signOut(auth);
    setUser(null);
    setProfile(null);
  }

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    let generation = 0, mounted = true, acceptedUid = "";
    const unsubscribeAuth = onIdTokenChanged(auth, async (currentUser) => {
      const run = ++generation;
      unsubscribeProfile?.(); unsubscribeProfile = undefined;
      // A refresh of the same account is not a logout. Keep its last verified
      // profile until the new token is checked; clear immediately on UID change.
      if (!currentUser || acceptedUid !== currentUser.uid) { setUser(null); setProfile(null); }
      setLoading(true); setSessionProblem("");
      if (!currentUser) { acceptedUid = ""; setLoading(false); return; }
      try { await checkAccountSession(currentUser); }
      catch (error) {
        if (mounted && run === generation) {
          acceptedUid = ""; setUser(null); setProfile(null); setLoading(false);
          setSessionProblem((error as Error).message || "Не удалось проверить вход. Повторите попытку");
        }
        return;
      }
      if (!mounted || run !== generation) return;
      acceptedUid = currentUser.uid; setUser(currentUser);

      unsubscribeProfile = onSnapshot(
        doc(db, "users", currentUser.uid),
        (snapshot) => {
          if (!mounted || run !== generation) return;
          setProfile(snapshot.exists() ? (snapshot.data() as UserProfile) : null);
          setLoading(false);
        },
        (error) => {
          if (!mounted || run !== generation) return;
          console.error("Profile realtime error:", error);
          setProfile(null);
          setLoading(false);
        }
      );
    });

    return () => {
      mounted = false; generation++; unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, [sessionRetry]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, profile, loading, register, login, resetPassword, logout }),
    [user, profile, loading]
  );

  return <AuthContext.Provider value={value}>{sessionProblem ? <main className="mx-auto max-w-md px-5 py-20"><h1 className="text-2xl font-black">Подтвердите вход</h1><p role="alert" className="mt-4 leading-7 text-slate-600">{sessionProblem}</p><button onClick={() => setSessionRetry(v => v + 1)} className="mt-6 rounded-2xl bg-blue-600 px-5 py-4 font-bold text-white">Повторить проверку</button><button onClick={() => void signOut(auth).then(() => { window.location.assign("/auth"); })} className="mt-3 block p-3 font-bold text-blue-600">Войти заново</button></main> : children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth должен использоваться внутри AuthProvider");
  }
  return context;
}
