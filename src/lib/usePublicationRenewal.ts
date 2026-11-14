"use client";
import { useEffect, useRef, useState } from "react";
import { isPublicationExpired, publicationDateMillis, publicationExpiryMillis } from "./publication-lifetime";
import { renewPublication, type PublicationKind, type PublicationRenewalResult } from "./renewPublication";

export function usePublicationRenewal(kind: PublicationKind, publicationId: string, publication: unknown) {
  const key = `${kind}:${publicationId}`;
  const scope = useRef(key);
  scope.current = key;
  const working = useRef("");
  const [state, setState] = useState<{ key: string; busy: boolean; error: string; result: PublicationRenewalResult | null }>({ key, busy: false, error: "", result: null });
  useEffect(() => { scope.current = key; return () => { scope.current = ""; }; }, [key]);
  const current = state.key === key ? state : { busy: false, error: "", result: null };
  const source = publication && typeof publication === "object" ? publication as Record<string, unknown> : {};
  const effective = current.result && publicationDateMillis(source.createdAt) < current.result.createdAt
    ? { ...source, ...current.result } : publication;

  async function renew() {
    if (working.current === key || !isPublicationExpired(effective)) return;
    working.current = key;
    setState(previous => ({ key, busy: true, error: "", result: previous.key === key ? previous.result : null }));
    try {
      const result = await renewPublication(kind, publicationId, publicationExpiryMillis(effective));
      if (scope.current === key) setState({ key, busy: false, error: "", result });
    } catch (error) {
      if (scope.current === key) setState(previous => ({ key, busy: false,
        result: previous.key === key ? previous.result : null,
        error: error instanceof Error ? error.message : "Не удалось опубликовать объявление. Повторите попытку." }));
    } finally { if (working.current === key) working.current = ""; }
  }
  return { publication: effective, busy: current.busy, error: current.error, renew };
}
