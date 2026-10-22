"use client";
import { useCallback, useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { normalizeAvailabilityDay, type AvailabilityDays } from "./availability-calendar";

export function useAvailabilityDays(uid: string | undefined): { days: AvailabilityDays; loading: boolean; error: string; refresh: () => void } {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ uid: string | undefined; days: AvailabilityDays; loading: boolean; error: string }>({ uid, days: {}, loading: Boolean(uid), error: "" });
  useEffect(() => {
    let active = true;
    setState(previous => ({ uid, days: previous.uid === uid ? previous.days : {}, loading: Boolean(uid), error: "" }));
    if (!uid) return () => { active = false; };
    const unsubscribe = onSnapshot(collection(db, "availability", uid, "days"), snapshot => {
      if (!active) return;
      const days: AvailabilityDays = {};
      for (const item of snapshot.docs) {
        const day = normalizeAvailabilityDay(item.id, item.data());
        if (day) days[day.id] = day;
      }
      setState({ uid, days, loading: false, error: "" });
    }, () => {
      if (active) setState(previous => ({ uid, days: previous.uid === uid ? previous.days : {}, loading: false, error: "Не получилось загрузить календарь. Повторите попытку." }));
    });
    return () => { active = false; unsubscribe(); };
  }, [uid, revision]);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  return { ...(state.uid === uid ? state : { days: {}, loading: Boolean(uid), error: "" }), refresh };
}
