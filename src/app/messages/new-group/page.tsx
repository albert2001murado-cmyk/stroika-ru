"use client";

import { useAuth } from "@/components/AuthProvider";
import { getApiUrl } from "@/lib/getApiUrl";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { ArrowLeft, Camera, Hammer, Loader2, MessageCircleMore, Ruler, ShieldCheck, UserRound, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

async function readApiResult(response: Response) {
  const text = await response.text();
  if (!text) return {} as Record<string, unknown>;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      response.ok
        ? "Сервер вернул некорректный ответ. Перезапустите сайт и попробуйте ещё раз."
        : text.slice(0, 180)
    );
  }
}

function inviteTokenFromSeed(seed: string) {
  return Array.from(seed)
    .map((character) => character.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32)
    .padEnd(32, "0");
}

export default function NewGroupPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [title, setTitle] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user || sending) return;
    setSending(true);
    setError("");

    try {
      let avatarUrl = "";
      let avatarPath = "";
      if (avatar) {
        const formData = new FormData();
        formData.append("file", avatar);
        const uploadResponse = await fetch(getApiUrl("/api/chat-upload"), { method: "POST", body: formData });
        const upload = await readApiResult(uploadResponse);
        if (!uploadResponse.ok || upload.type !== "image" || !upload.url) {
          throw new Error(String(upload.error || "Не получилось загрузить аватар группы."));
        }
        avatarUrl = String(upload.url);
        avatarPath = String(upload.path || "");
      }

      const chatRef = doc(collection(db, "chats"));
      const inviteSeed = doc(collection(db, "chats")).id;
      const inviteToken = inviteTokenFromSeed(`${inviteSeed}${chatRef.id}`);
      const profileSnapshot = await getDoc(doc(db, "users", user.uid));
      const profile = profileSnapshot.data() || {};
      const displayName = String(
        profile.displayName || profile.name || user.displayName || user.email || "Пользователь"
      );
      const memberAvatar = String(
        profile.avatarUrl || profile.photoURL || user.photoURL || ""
      );

      await setDoc(chatRef, {
        chatType: "group",
        isGroup: true,
        groupTitle: title.trim().slice(0, 80),
        groupAvatarUrl: avatarUrl,
        groupAvatarPath: avatarPath,
        ownerId: user.uid,
        adminIds: [user.uid],
        participantIds: [user.uid],
        participants: {
          [user.uid]: { uid: user.uid, displayName, avatarUrl: memberAvatar },
        },
        users: {
          [user.uid]: {
            uid: user.uid,
            name: displayName,
            displayName,
            photoURL: memberAvatar,
            avatarUrl: memberAvatar,
          },
        },
        memberCount: 1,
        inviteToken,
        inviteEnabled: true,
        lastMessageText: "Группа создана",
        lastMessageType: "text",
        pinnedBy: {},
        mutedBy: {},
        hiddenFor: {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
      });
      router.push(`/messages/${chatRef.id}/info?created=1`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Не получилось создать группу.");
    } finally {
      setSending(false);
    }
  }

  if (loading) return <main className="min-h-screen bg-[#f4f7ff] p-8 text-center font-bold text-slate-400">Загружаем...</main>;
  if (!user) {
    return (
      <main className="min-h-screen bg-[#f4f7ff] px-4 py-10">
        <div className="mx-auto max-w-lg rounded-[34px] bg-white p-8 text-center shadow-xl">
          <MessageCircleMore className="mx-auto text-[#0057ff]" size={48} />
          <h1 className="mt-5 text-3xl font-black">Сначала войдите</h1>
          <Link href="/auth?next=/messages/new-group" className="btn-primary mt-6 inline-flex">Войти</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(145deg,#f7f9ff_0%,#eef4ff_52%,#f7fbff_100%)] px-4 py-7 sm:py-11">
      <div className="relative mx-auto max-w-2xl">
        <Link href="/messages" className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:text-[#0057ff]">
          <ArrowLeft size={18} /> К сообщениям
        </Link>

        <form onSubmit={submit} className="mt-5 overflow-hidden rounded-[36px] bg-white shadow-[0_28px_80px_rgba(15,23,42,.12)] ring-1 ring-white">
          <div className="relative overflow-hidden bg-gradient-to-br from-[#004bdc] via-[#0057ff] to-[#397eff] px-6 py-8 text-white sm:px-9 sm:py-10">
            <Hammer className="group-tool pointer-events-none absolute right-[8%] top-6 text-white/28" size={42} style={{ animationDelay: "-1.2s" }} />
            <Wrench className="group-tool pointer-events-none absolute bottom-4 right-[29%] text-blue-100/25" size={36} style={{ animationDelay: "-3.1s" }} />
            <Ruler className="group-tool pointer-events-none absolute right-[51%] top-5 text-[#ffd233]/35" size={34} style={{ animationDelay: "-4.8s" }} />
            <div className="relative">
              <ShieldCheck size={28} />
              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Новая рабочая группа</h1>
              <p className="mt-3 max-w-xl font-semibold leading-6 text-blue-100">Участники смогут войти только по вашей личной ссылке-приглашению.</p>
            </div>
          </div>

          <div className="p-6 sm:p-9">
            <div className="flex flex-col items-center">
              <label className="group relative flex h-32 w-32 cursor-pointer items-center justify-center overflow-hidden rounded-[34px] bg-blue-50 text-[#0057ff] ring-1 ring-blue-100 transition hover:-translate-y-1 hover:shadow-xl">
                {preview ? <img src={preview} alt="Аватар группы" className="h-full w-full object-cover" /> : <UserRound size={48} />}
                <span className="absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#0057ff] text-white shadow-lg"><Camera size={19} /></span>
                <input type="file" accept="image/*" className="hidden" onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  if (preview) URL.revokeObjectURL(preview);
                  setAvatar(file);
                  setPreview(file ? URL.createObjectURL(file) : "");
                }} />
              </label>
              <p className="mt-3 text-sm font-bold text-slate-500">Аватар можно добавить сейчас или позже</p>
            </div>

            <label className="mt-7 block text-sm font-black text-slate-700">Название группы</label>
            <input className="input mt-2 w-full" maxLength={80} placeholder="Например: Бригада — дом на Лесной" value={title} onChange={(event) => setTitle(event.target.value)} required />

            {error ? <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-black text-red-600 ring-1 ring-red-100">{error}</p> : null}

            <button disabled={sending || title.trim().length < 2} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0057ff] px-5 py-4 text-base font-black text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-1 hover:bg-[#004de6] active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50">
              {sending ? <Loader2 className="animate-spin" size={21} /> : <MessageCircleMore size={21} />}
              {sending ? "Создаём группу..." : "Создать и получить ссылку"}
            </button>
          </div>
        </form>
      </div>
      <style jsx>{`
        @keyframes groupToolFloat {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(-7deg); opacity: .24; }
          50% { transform: translate3d(0, -10px, 0) rotate(5deg); opacity: .42; }
        }
        .group-tool { animation: groupToolFloat 6.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .group-tool { animation: none !important; }
        }
      `}</style>
    </main>
  );
}
