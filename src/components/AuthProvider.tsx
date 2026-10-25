"use client";

import { ContactRequestError, contactRequest } from "@/lib/contact-request";
import { auth, db } from "@/lib/firebase";
import type { AccountType, UserProfile } from "@/types";
import {
  User,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
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
    await signInWithEmailAndPassword(
      auth,
      email.trim().toLocaleLowerCase("en-US"),
      password
    );
  }

  async function resetPassword(email: string) {
    auth.languageCode = "ru";
    await sendPasswordResetEmail(
      auth,
      email.trim().toLocaleLowerCase("en-US")
    );
  }

  async function logout() {
    await signOut(auth);
    setUser(null);
    setProfile(null);
  }

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = undefined;
      }

      setUser(currentUser);

      if (!currentUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      unsubscribeProfile = onSnapshot(
        doc(db, "users", currentUser.uid),
        (snapshot) => {
          setProfile(snapshot.exists() ? (snapshot.data() as UserProfile) : null);
          setLoading(false);
        },
        (error) => {
          console.error("Profile realtime error:", error);
          setProfile(null);
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, profile, loading, register, login, resetPassword, logout }),
    [user, profile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth должен использоваться внутри AuthProvider");
  }
  return context;
}
