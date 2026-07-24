"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { Flag, Loader2, X } from "lucide-react";
import { useState } from "react";

const REASONS = [
  "Мошенничество",
  "Спам или реклама",
  "Оскорбления",
  "Запрещённые услуги",
  "Недостоверная информация",
  "Чужие фотографии",
  "Другое",
];

export default function ReportDialog({
  targetType,
  targetId,
  targetOwnerId = "",
  targetTitle,
  buttonClassName = "",
  compact = false,
  targetSnapshot,
}: {
  targetType: "listing" | "profile" | "request" | "chat" | "message" | "review";
  targetId: string;
  targetOwnerId?: string;
  targetTitle: string;
  buttonClassName?: string;
  compact?: boolean;
  targetSnapshot?: Record<string, unknown>;
}) {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!user || !reason || !targetId) return;
    try {
      setSending(true);
      await addDoc(collection(db, "reports"), {
        reporterId: user.uid,
        reporterName: profile?.displayName || user.displayName || user.email || "Пользователь",
        reporterEmail: user.email || "",
        targetType,
        targetId,
        targetOwnerId,
        targetTitle,
        targetSnapshot: targetSnapshot || null,
        reason,
        comment: comment.trim(),
        status: "open",
        source: "web",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setDone(true);
      setReason("");
      setComment("");
    } finally {
      setSending(false);
    }
  }

  if (!user) return null;

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setDone(false); }} className={buttonClassName || "inline-flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-600 ring-1 ring-red-100 hover:bg-red-100"}>
        <Flag size={17} /> {compact ? null : "Пожаловаться"}
      </button>

      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.currentTarget === e.target) setOpen(false); }}>
          <div className="w-full max-w-lg rounded-[32px] bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Flag size={21} /></div>
              <div className="min-w-0 flex-1"><h2 className="text-2xl font-black text-slate-950">Пожаловаться</h2><p className="mt-1 truncate text-sm font-bold text-slate-500">{targetTitle}</p></div>
              <button type="button" onClick={() => setOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><X size={19} /></button>
            </div>

            {done ? (
              <div className="mt-6 rounded-3xl bg-green-50 p-5 text-center text-sm font-black text-green-700 ring-1 ring-green-100">Жалоба отправлена модератору.</div>
            ) : (
              <>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {REASONS.map((item) => (
                    <button type="button" key={item} onClick={() => setReason(item)} className={`rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${reason === item ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>{item}</button>
                  ))}
                </div>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} className="input mt-4 min-h-28 resize-none" placeholder="Комментарий (необязательно)" />
                <button type="button" disabled={!reason || sending} onClick={submit} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0057ff] px-5 py-4 text-sm font-black text-white disabled:opacity-50">
                  {sending ? <Loader2 className="animate-spin" size={19} /> : <Flag size={18} />} Отправить жалобу
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
