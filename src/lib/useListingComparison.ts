"use client";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { changeComparisonSelection, watchComparisonSelection } from "./comparisonSelection";

export function useListingComparison() {
  const [uid, setUid] = useState(auth.currentUser?.uid || "");
  const [selection, setSelection] = useState<{ uid: string; ids: string[]; ready: boolean; error: string }>({ uid: "", ids: [], ready: false, error: "" });
  useEffect(() => onAuthStateChanged(auth, current => setUid(current?.uid || "")), []);
  useEffect(() => {
    if (!uid) return;
    let active = true;
    const stop = watchComparisonSelection(uid, ids => {
      if (active && auth.currentUser?.uid === uid) setSelection({ uid, ids, ready: true, error: "" });
    }, () => {
      if (active && auth.currentUser?.uid === uid) setSelection({ uid, ids: [], ready: false, error: "Не удалось загрузить список сравнения" });
    });
    return () => { active = false; stop(); };
  }, [uid]);
  const matchesAccount = Boolean(uid && selection.uid === uid && auth.currentUser?.uid === uid);
  return {
    uid, ids: matchesAccount ? selection.ids : [], ready: !uid || matchesAccount && selection.ready,
    error: matchesAccount ? selection.error : "",
    change: (action: "add" | "remove" | "clear", id?: string) => changeComparisonSelection(uid, action, id),
  };
}
