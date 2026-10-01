"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, type Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type AppNotification = {
  id: string;
  type?: string;
  title?: string;
  body?: string;
  url?: string;
  read?: boolean;
  createdAt?: Timestamp;
};

// Same collection, ordering and window as the mobile notification centre.
export function useNotifications(uid?: string) {
  const [state, setState] = useState<{
    uid?: string; items: AppNotification[]; loading: boolean; error: string;
  }>({ items: [], loading: true, error: "" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setState({ uid, items: [], loading: Boolean(uid), error: "" });
    if (!uid) return;
    return onSnapshot(
      query(collection(db, "users", uid, "notifications"), orderBy("createdAt", "desc"), limit(100)),
      (snapshot) => setState({
        uid,
        items: snapshot.docs.map((item) => ({ ...item.data(), id: item.id } as AppNotification)),
        loading: false, error: "",
      }),
      () => setState({ uid, items: [], loading: false, error: "Не удалось загрузить уведомления. Попробуйте ещё раз." }),
    );
  }, [uid, attempt]);

  const items = uid && state.uid === uid ? state.items : [];
  return {
    items,
    unread: items.filter((item) => !item.read).length,
    loading: Boolean(uid) && (state.uid !== uid || state.loading),
    error: state.uid === uid ? state.error : "",
    retry: () => setAttempt((value) => value + 1),
  };
}
