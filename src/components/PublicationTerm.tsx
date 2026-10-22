"use client";
import { useAuth } from "@/components/AuthProvider";
import { publicationTermText } from "@/lib/publication-lifetime";
import { isPublicationOwner } from "@/lib/publication-owner";
import { usePublicationClock } from "@/lib/usePublicationExpiry";

export default function PublicationTerm({ publication, kind = "listing" }: { publication?: unknown; kind?: "listing" | "request" }) {
  const { user } = useAuth();
  const isOwner = isPublicationOwner(publication, user?.uid, kind);
  usePublicationClock(isOwner ? [publication] : []);
  if (publication !== undefined && !isOwner) return null;
  return <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{publicationTermText(publication)}</p>;
}
