"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { Ban, Loader2, ShieldOff } from "lucide-react";
import { useEffect, useState } from "react";

export default function UserBlockButton({ targetUserId, compact = false, onChange }: { targetUserId: string; compact?: boolean; onChange?: (blocked: boolean) => void }) {
  const { user } = useAuth();
  const [blocked, setBlocked] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!user || !targetUserId || user.uid === targetUserId) return;
    getDoc(doc(db, "users", user.uid, "blocked", targetUserId))
      .then((snap) => setBlocked(snap.exists()))
      .catch(() => undefined);
  }, [targetUserId, user]);

  if (!user || !targetUserId || user.uid === targetUserId) return null;

  async function toggle() {
    if (!user) return;
    try {
      setWorking(true);
      const ref = doc(db, "users", user.uid, "blocked", targetUserId);
      if (blocked) {
        await deleteDoc(ref);
        setBlocked(false);
        onChange?.(false);
      } else {
        if (!confirm("Заблокировать пользователя? Он не сможет писать вам сообщения.")) return;
        await setDoc(ref, { ownerId: user.uid, blockedUserId: targetUserId, createdAt: serverTimestamp() });
        setBlocked(true);
        onChange?.(true);
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <button type="button" disabled={working} onClick={toggle} className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-black ring-1 transition disabled:opacity-60 ${blocked ? "bg-slate-100 text-slate-700 ring-slate-200" : "bg-red-50 text-red-600 ring-red-100 hover:bg-red-100"}`}>
      {working ? <Loader2 className="animate-spin" size={17} /> : blocked ? <ShieldOff size={17} /> : <Ban size={17} />}
      {compact ? null : blocked ? "Разблокировать" : "Заблокировать"}
    </button>
  );
}
