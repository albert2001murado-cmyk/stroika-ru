"use client";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { isPublicationExpired, nextPublicationExpiry } from "./publication-lifetime";

export function usePublicationClock(items: readonly unknown[], refreshMs = 0) {
  const [now, setNow] = useState(() => Date.now());
  const deadline = nextPublicationExpiry(items, now);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = deadline ? setTimeout(refresh, Math.min(refreshMs > 0 ? refreshMs : 2_000_000_000, Math.max(1, deadline - Date.now() + 1))) : undefined;
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [deadline, now, refreshMs]);
  return now;
}

export function usePublicationExpiry<T>(items: T[], setItems: Dispatch<SetStateAction<T[]>>, keepExpired = false, publication?: (item: T) => unknown) {
  const now = usePublicationClock(publication ? items.map(publication) : items);
  useEffect(() => {
    const expired = (item: T) => isPublicationExpired(publication ? publication(item) : item);
    if (!keepExpired && items.some(expired)) {
      setItems(current => current.filter(item => !expired(item)));
    }
  }, [items, setItems, keepExpired, now, publication]);
  return now;
}
