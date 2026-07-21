"use client";

import { auth, db } from "@/lib/firebase";
import type { AccountType, UserProfile } from "@/types";
import {
  User,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
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
  companyInn?: string;
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

    const isBusiness = data.accountType === "ip" || data.accountType === "ooo";

    try {
      if (isBusiness) {
        const token = await credential.user.getIdToken(true);
        const response = await fetch("/api/register-business", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            accountType: data.accountType,
            inn: data.companyInn,
            representativeName: data.displayName,
            city: data.city,
            phone: data.phone,
          }),
        });

        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Не получилось зарегистрировать организацию.");
        }

        await credential.user.reload();
        const businessProfile = payload.profile as UserProfile;
        setUser(auth.currentUser || credential.user);
        setProfile(businessProfile);
        return;
      }

      const individualName = data.displayName.trim();
      await updateProfile(credential.user, { displayName: individualName });

      const userProfile: UserProfile = {
        uid: credential.user.uid,
        email: data.email,
        displayName: individualName,
        representativeName: individualName,
        accountType: "individual",
        companyName: "",
        city: data.city?.trim() || "",
        phone: data.phone?.trim() || "",
        avatarUrl: "",
        avatarPath: "",
        verified: false,
        isVerified: false,
        verificationStatus: "unverified",
        verifiedAt: null,
        verifiedBy: "",
      };

      await setDoc(doc(db, "users", credential.user.uid), {
        ...userProfile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setUser(credential.user);
      setProfile(userProfile);
    } catch (error) {
      try {
        await deleteUser(credential.user);
      } catch (deleteError) {
        console.error("Не получилось откатить созданного пользователя:", deleteError);
      }
      throw error;
    }
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
    () => ({ user, profile, loading, register, login, logout }),
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
