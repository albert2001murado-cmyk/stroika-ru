"use client";

import { auth, db } from "@/lib/firebase";
import type { AccountType, UserProfile } from "@/types";
import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type RegisterData = {
  email: string;
  password: string;
  displayName: string;
  accountType: AccountType;
  companyName?: string;
  city?: string;
  phone?: string;
};

type AuthContextValue = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  register: (data: RegisterData) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function register(data: RegisterData) {
    const credential = await createUserWithEmailAndPassword(
      auth,
      data.email,
      data.password
    );

    await updateProfile(credential.user, {
      displayName: data.displayName,
    });

    const userProfile: UserProfile = {
      uid: credential.user.uid,
      email: data.email,
      displayName: data.displayName,
      accountType: data.accountType,
      companyName: data.companyName || "",
      city: data.city || "",
      phone: data.phone || "",
      avatarUrl: "",
      avatarPath: "",
    };

    await setDoc(doc(db, "users", credential.user.uid), {
      ...userProfile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    setUser(credential.user);
    setProfile(userProfile);
  }

  async function login(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password);
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
          if (snapshot.exists()) {
            setProfile(snapshot.data() as UserProfile);
          } else {
            setProfile(null);
          }

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

      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      register,
      login,
      logout,
    }),
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




