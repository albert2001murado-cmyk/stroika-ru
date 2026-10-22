"use client";
import { publicationTermText } from "@/lib/publication-lifetime";
import { usePublicationClock } from "@/lib/usePublicationExpiry";

export default function PublicationTerm({ publication }: { publication?: unknown }) {
  usePublicationClock([publication]);
  return <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{publicationTermText(publication)}</p>;
}
