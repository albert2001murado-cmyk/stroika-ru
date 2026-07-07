"use client";

import { db } from "@/lib/firebase";
import { BadgeCheck } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

type ListingAuthorVerifiedBadgeProps = {
  listing?: any;
  userId?: string;
  className?: string;
};

function getAuthorId(listing: any, userId?: string) {
  return (
    userId ||
    listing?.userId ||
    listing?.authorId ||
    listing?.ownerId ||
    listing?.creatorId ||
    listing?.uid ||
    listing?.sellerId ||
    ""
  );
}

function getLocalVerified(listing: any) {
  return Boolean(
    listing?.verified ||
      listing?.isVerified ||
      listing?.authorVerified ||
      listing?.userVerified ||
      listing?.profileVerified ||
      listing?.verificationStatus === "approved"
  );
}

export default function ListingAuthorVerifiedBadge({
  listing,
  userId,
  className = "",
}: ListingAuthorVerifiedBadgeProps) {
  const authorId = useMemo(() => getAuthorId(listing, userId), [listing, userId]);
  const [verified, setVerified] = useState(getLocalVerified(listing));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadUserVerified() {
      if (getLocalVerified(listing)) {
        setVerified(true);
        return;
      }

      if (!authorId) {
        setVerified(false);
        return;
      }

      setLoading(true);

      try {
        const userSnap = await getDoc(doc(db, "users", authorId));

        if (!userSnap.exists()) {
          if (!cancelled) setVerified(false);
          return;
        }

        const userData = userSnap.data() as any;

        const isVerified = Boolean(
          userData?.verified ||
            userData?.isVerified ||
            userData?.verificationStatus === "approved"
        );

        if (!cancelled) setVerified(isVerified);
      } catch (error) {
        console.error("Не получилось проверить статус исполнителя:", error);
        if (!cancelled) setVerified(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadUserVerified();

    return () => {
      cancelled = true;
    };
  }, [authorId, listing]);

  if (!verified || loading) {
    return null;
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700 ring-1 ring-blue-100 ${className}`}
      title="Проверенный исполнитель"
    >
      <BadgeCheck size={14} strokeWidth={2.8} />
      Проверен
    </span>
  );
}
