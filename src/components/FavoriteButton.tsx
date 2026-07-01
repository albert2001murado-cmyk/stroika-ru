"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import {
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { Heart, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { MouseEvent, useEffect, useState } from "react";

type FavoriteButtonProps = {
  listingId: string;
  title: string;
  city?: string;
  priceFrom?: number | null;
  imageUrl?: string;
  className?: string;
  compact?: boolean;
};

export default function FavoriteButton({
  listingId,
  title,
  city = "",
  priceFrom = null,
  imageUrl = "",
  className = "",
  compact = false,
}: FavoriteButtonProps) {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [isFavorite, setIsFavorite] = useState(false);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      setIsFavorite(false);
      setChecking(false);
      return;
    }

    const favoriteRef = doc(db, "users", user.uid, "favorites", listingId);

    const unsub = onSnapshot(
      favoriteRef,
      (snapshot) => {
        setIsFavorite(snapshot.exists());
        setChecking(false);
      },
      () => {
        setChecking(false);
      }
    );

    return () => unsub();
  }, [listingId, loading, user]);

  async function toggleFavorite(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();

    if (loading || checking || saving) return;

    if (!user) {
      router.push("/auth");
      return;
    }

    setSaving(true);

    try {
      const favoriteRef = doc(db, "users", user.uid, "favorites", listingId);
      const listingRef = doc(db, "listings", listingId);

      if (isFavorite) {
        await deleteDoc(favoriteRef);

        await updateDoc(listingRef, {
          favoritesCount: increment(-1),
        }).catch(() => {});
      } else {
        await setDoc(favoriteRef, {
          listingId,
          title,
          city,
          priceFrom: priceFrom || null,
          imageUrl,
          createdAt: serverTimestamp(),
        });

        await updateDoc(listingRef, {
          favoritesCount: increment(1),
        }).catch(() => {});
      }
    } finally {
      setSaving(false);
    }
  }

  const baseClass =
    "inline-flex items-center justify-center gap-2 rounded-2xl font-black transition active:scale-95 disabled:opacity-60";

  const normalClass = isFavorite
    ? "bg-red-50 text-red-600 ring-1 ring-red-100 hover:bg-red-100"
    : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-blue-50 hover:text-[#0057ff] hover:ring-blue-100";

  const compactClass = compact ? "h-11 w-11 p-0" : "px-5 py-3";

  return (
    <button
      type="button"
      onClick={toggleFavorite}
      disabled={loading || checking || saving}
      className={`${baseClass} ${normalClass} ${compactClass} ${className}`}
      title={isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
    >
      {saving ? (
        <Loader2 className="animate-spin" size={20} />
      ) : (
        <Heart
          size={20}
          className={isFavorite ? "fill-red-500 text-red-500" : ""}
        />
      )}

      {!compact && (
        <span>{isFavorite ? "В избранном" : "В избранное"}</span>
      )}
    </button>
  );
}
