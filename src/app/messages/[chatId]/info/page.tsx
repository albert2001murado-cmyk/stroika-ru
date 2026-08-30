"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { getApiUrl } from "@/lib/getApiUrl";
import { collection, doc, onSnapshot, orderBy, query, type Timestamp } from "firebase/firestore";
import {
  ArrowLeft,
  Camera,
  Check,
  Copy,
  FileText,
  Hammer,
  Image as ImageIcon,
  Link2,
  Loader2,
  Mic2,
  Pin,
  RefreshCw,
  Ruler,
  Save,
  Settings2,
  ShieldCheck,
  UserRound,
  UsersRound,
  Video,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChangeEvent, useEffect, useMemo, useState } from "react";

type Participant = { uid?: string; displayName?: string; name?: string; avatarUrl?: string; photoURL?: string };
type GroupChat = {
  id: string;
  chatType?: string;
  groupTitle?: string;
  groupAvatarUrl?: string;
  groupAvatarPath?: string;
  ownerId?: string;
  adminIds?: string[];
  participantIds?: string[];
  participants?: Record<string, Participant>;
  users?: Record<string, Participant>;
  inviteToken?: string;
};
type Message = {
  id: string;
  senderId?: string;
  senderName?: string;
  text?: string;
  type?: string;
  mediaUrl?: string;
  imageUrl?: string;
  fileName?: string;
  mediaType?: string;
  pinned?: boolean;
  createdAt?: Timestamp;
};
type TabId = "members" | "media" | "voice" | "files" | "links";

const URL_RE = /https?:\/\/[^\s<>()]+/gi;

function participant(chat: GroupChat, uid: string) {
  return chat.participants?.[uid] || chat.users?.[uid] || {};
}

function displayDate(value?: Timestamp) {
  if (!value?.toDate) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(value.toDate());
}

export default function GroupInfoPage() {
  const { chatId = "" } = useParams<{ chatId: string }>();
  const { user, loading } = useAuth();
  const [chat, setChat] = useState<GroupChat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarPath, setAvatarPath] = useState("");
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [tab, setTab] = useState<TabId>("members");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user || !chatId) return;
    const unsubChat = onSnapshot(doc(db, "chats", chatId), (snapshot) => {
      if (!snapshot.exists()) {
        setError("Группа не найдена.");
        setPageLoading(false);
        return;
      }
      const next = { id: snapshot.id, ...snapshot.data() } as GroupChat;
      setChat(next);
      setTitle((current) => current || next.groupTitle || "Групповой чат");
      setAvatarUrl((current) => current || next.groupAvatarUrl || "");
      setAvatarPath((current) => current || next.groupAvatarPath || "");
      setPageLoading(false);
    });
    const unsubMessages = onSnapshot(
      query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc")),
      (snapshot) => setMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as Message[])
    );
    return () => { unsubChat(); unsubMessages(); };
  }, [chatId, user]);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const participantIds = chat?.participantIds || [];
  const isMember = Boolean(user && participantIds.includes(user.uid));
  const canEdit = Boolean(user && chat && (chat.ownerId === user.uid || chat.adminIds?.includes(user.uid)));
  const inviteLink = typeof window !== "undefined" && chat?.inviteToken
    ? `${window.location.origin}/join/${chat.inviteToken}`
    : "";

  const media = messages.filter((message) => ["image", "video", "mixed"].includes(message.type || "") || message.imageUrl);
  const voices = messages.filter((message) => message.type === "audio");
  const files = messages.filter((message) => message.type === "document" || (message.fileName && !["image", "video", "audio"].includes(message.type || "")));
  const links = useMemo(
    () => messages.flatMap((message) => (message.text?.match(URL_RE) || []).map((url) => ({ message, url }))),
    [messages]
  );

  async function uploadAvatar(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(getApiUrl("/api/chat-upload"), { method: "POST", body: formData });
    const result = await response.json();
    if (!response.ok || result.type !== "image" || !result.url) throw new Error(result.error || "Не получилось загрузить аватар.");
    return result as { url: string; path?: string };
  }

  async function save() {
    if (!user || !chat || !canEdit || saving) return;
    setSaving(true);
    setError("");
    try {
      let nextUrl = avatarUrl;
      let nextPath = avatarPath;
      if (avatarFile) {
        const uploaded = await uploadAvatar(avatarFile);
        nextUrl = uploaded.url;
        nextPath = uploaded.path || "";
      }
      const token = await user.getIdToken();
      const response = await fetch(getApiUrl("/api/groups/update"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chatId, title, avatarUrl: nextUrl, avatarPath: nextPath }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Не получилось сохранить группу.");
      setAvatarUrl(nextUrl);
      setAvatarPath(nextPath);
      setAvatarFile(null);
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Не получилось сохранить группу.");
    } finally {
      setSaving(false);
    }
  }

  async function copyInvite() {
    if (!inviteLink) return;
    if (navigator.share) {
      await navigator.share({ title: chat?.groupTitle || "Групповой чат", text: "Присоединяйтесь к рабочей группе в Стройка.ру", url: inviteLink }).catch(() => undefined);
    } else {
      await navigator.clipboard.writeText(inviteLink);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function refreshInvite() {
    if (!user || !canEdit) return;
    const token = await user.getIdToken();
    const response = await fetch(getApiUrl("/api/groups/update"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ chatId, action: "new-invite" }),
    });
    const result = await response.json();
    if (!response.ok) setError(result.error || "Не получилось обновить ссылку.");
  }

  if (loading || pageLoading) return <main className="min-h-screen bg-[#f4f7ff] p-10 text-center font-bold text-slate-400">Загружаем группу...</main>;
  if (!user || !chat || chat.chatType !== "group" || !isMember) {
    return <main className="min-h-screen bg-[#f4f7ff] p-8"><div className="mx-auto max-w-lg rounded-[32px] bg-white p-8 text-center shadow-xl"><ShieldCheck className="mx-auto text-[#0057ff]" size={46} /><h1 className="mt-5 text-2xl font-black">Настройки недоступны</h1><p className="mt-2 font-semibold text-slate-500">Войти в группу можно только по ссылке-приглашению.</p><Link href="/messages" className="btn-primary mt-6 inline-flex">К сообщениям</Link></div></main>;
  }

  const shownAvatar = avatarPreview || avatarUrl;
  const tabs: Array<{ id: TabId; label: string; count: number; Icon: typeof UsersRound }> = [
    { id: "members", label: "Участники", count: participantIds.length, Icon: UsersRound },
    { id: "media", label: "Медиа", count: media.length, Icon: ImageIcon },
    { id: "voice", label: "Голосовые", count: voices.length, Icon: Mic2 },
    { id: "files", label: "Файлы", count: files.length, Icon: FileText },
    { id: "links", label: "Ссылки", count: links.length, Icon: Link2 },
  ];

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(145deg,#f7f9ff_0%,#eef4ff_52%,#f7fbff_100%)] px-3 py-5 sm:px-6 sm:py-9">
      <div className="relative mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-3">
          <Link href={`/messages/${chatId}`} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:text-[#0057ff]"><ArrowLeft size={18} /> В чат</Link>
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-xs font-black uppercase tracking-[.12em] text-[#0057ff] ring-1 ring-blue-100"><Settings2 size={16} /> Настройки группы</span>
        </div>

        <section className="mt-5 overflow-hidden rounded-[38px] bg-white shadow-[0_28px_80px_rgba(15,23,42,.12)] ring-1 ring-white">
          <div className="relative overflow-hidden bg-gradient-to-br from-[#004bdc] via-[#0057ff] to-[#397eff] px-6 pb-24 pt-8 text-white sm:px-10">
            <Hammer className="group-info-tool pointer-events-none absolute right-[10%] top-8 text-white/25" size={46} style={{ animationDelay: "-1.5s" }} />
            <Wrench className="group-info-tool pointer-events-none absolute bottom-7 right-[35%] text-blue-100/24" size={38} style={{ animationDelay: "-3.7s" }} />
            <Ruler className="group-info-tool pointer-events-none absolute right-[58%] top-8 text-[#ffd233]/32" size={36} style={{ animationDelay: "-5.2s" }} />
            <div className="relative flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.14em] text-blue-100">Рабочая группа</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">{chat.groupTitle || "Групповой чат"}</h1></div><span className="rounded-full bg-white/14 px-4 py-2 text-sm font-black ring-1 ring-white/20">{participantIds.length} участников</span></div>
          </div>

          <div className="-mt-16 grid gap-6 px-5 pb-7 sm:px-9 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="relative rounded-[30px] bg-white p-5 text-center shadow-xl ring-1 ring-slate-100">
              <label className={`group relative mx-auto flex h-32 w-32 items-center justify-center overflow-hidden rounded-[34px] bg-blue-50 text-[#0057ff] ring-1 ring-blue-100 ${canEdit ? "cursor-pointer" : ""}`}>
                {shownAvatar ? <img src={shownAvatar} alt={chat.groupTitle || "Группа"} className="h-full w-full object-cover" /> : <UserRound size={48} />}
                {canEdit ? <><span className="absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#0057ff] text-white shadow-lg"><Camera size={19} /></span><input type="file" accept="image/*" className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0] || null; if (avatarPreview) URL.revokeObjectURL(avatarPreview); setAvatarFile(file); setAvatarPreview(file ? URL.createObjectURL(file) : ""); }} /></> : null}
              </label>
              <p className="mt-4 text-sm font-black text-slate-950">{chat.groupTitle}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">Доступ только по приглашению</p>
            </div>

            <div className="relative rounded-[30px] bg-white p-5 shadow-xl ring-1 ring-slate-100 sm:p-6">
              {canEdit ? <><label className="text-sm font-black text-slate-700">Название группы</label><input className="input mt-2 w-full" maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} /><button onClick={save} disabled={saving || title.trim().length < 2} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[#0057ff] px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-1 disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} Сохранить оформление</button></> : <p className="font-bold text-slate-500">Название и аватар меняют владельцы и администраторы.</p>}

              <div className="mt-5 rounded-[24px] border border-blue-100 bg-blue-50/55 p-4">
                <div className="flex items-center gap-2 text-sm font-black text-[#0057ff]"><ShieldCheck size={18} /> Личная ссылка-приглашение</div>
                <p className="mt-2 truncate rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-500 ring-1 ring-blue-100">{inviteLink}</p>
                <div className="mt-3 flex flex-wrap gap-2"><button onClick={copyInvite} className="inline-flex items-center gap-2 rounded-2xl bg-[#0057ff] px-4 py-3 text-sm font-black text-white transition hover:-translate-y-0.5">{copied ? <Check size={18} /> : <Copy size={18} />}{copied ? "Скопировано" : "Поделиться ссылкой"}</button>{canEdit ? <button onClick={refreshInvite} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-700 ring-1 ring-blue-100 transition hover:-translate-y-0.5 hover:text-[#0057ff]"><RefreshCw size={18} /> Новая ссылка</button> : null}</div>
              </div>
              {error ? <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-black text-red-600">{error}</p> : null}
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[34px] bg-white p-4 shadow-sm ring-1 ring-slate-200/70 sm:p-6">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {tabs.map(({ id, label, count, Icon }) => <button key={id} onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition ${tab === id ? "bg-[#0057ff] text-white shadow-lg shadow-blue-600/20" : "bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-[#0057ff]"}`}><Icon size={18} /> {label} <span className={`rounded-full px-2 py-0.5 text-xs ${tab === id ? "bg-white/18" : "bg-white"}`}>{count}</span></button>)}
          </div>

          <div className="mt-5">
            {tab === "members" ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{participantIds.map((uid) => { const item = participant(chat, uid); const name = item.displayName || item.name || "Пользователь"; const avatar = item.avatarUrl || item.photoURL || ""; return <Link key={uid} href={`/user/${uid}`} className="group flex items-center gap-3 rounded-[22px] border border-slate-100 bg-slate-50 p-3 transition hover:-translate-y-1 hover:border-blue-200 hover:bg-white hover:shadow-lg"><span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-blue-50 text-[#0057ff]">{avatar ? <img src={avatar} alt={name} className="h-full w-full object-cover" /> : <UserRound size={22} />}</span><span className="min-w-0"><span className="block truncate font-black text-slate-950">{name}</span><span className="mt-1 block text-xs font-bold text-slate-500">{uid === chat.ownerId ? "Владелец" : chat.adminIds?.includes(uid) ? "Администратор" : "Участник"}</span></span></Link>; })}</div> : null}

            {tab === "media" ? media.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{media.map((message) => { const url = message.mediaUrl || message.imageUrl || ""; return <a key={message.id} href={url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-[22px] bg-slate-100 ring-1 ring-slate-200"><div className="relative aspect-square">{message.type === "video" ? <><video src={url} className="h-full w-full object-cover" /><span className="absolute inset-0 flex items-center justify-center bg-slate-950/20 text-white"><Video size={28} /></span></> : <img src={url} alt="Медиа из чата" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />}</div><div className="bg-white p-3"><p className="truncate text-xs font-black text-slate-700">{message.senderName || "Участник"}</p><p className="mt-1 text-[11px] font-bold text-slate-400">{displayDate(message.createdAt)}</p></div></a>; })}</div> : <Empty title="Медиа пока нет" /> : null}

            {tab === "voice" ? voices.length ? <div className="space-y-3">{voices.map((message) => <div key={message.id} className="flex flex-col gap-3 rounded-[22px] bg-slate-50 p-4 sm:flex-row sm:items-center"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#0057ff]"><Mic2 size={21} /></span><div className="min-w-0 flex-1"><p className="font-black text-slate-950">{message.senderName || "Участник"}</p><p className="text-xs font-bold text-slate-400">{displayDate(message.createdAt)}</p></div><audio controls src={message.mediaUrl} className="w-full sm:w-[300px]" /></div>)}</div> : <Empty title="Голосовых пока нет" /> : null}

            {tab === "files" ? files.length ? <div className="space-y-3">{files.map((message) => <a key={message.id} href={message.mediaUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-[22px] bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:bg-blue-50"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#0057ff]"><FileText size={21} /></span><span className="min-w-0 flex-1"><span className="block truncate font-black text-slate-950">{message.fileName || "Документ"}</span><span className="mt-1 block text-xs font-bold text-slate-500">{message.senderName || "Участник"} · {displayDate(message.createdAt)}</span></span></a>)}</div> : <Empty title="Файлов пока нет" /> : null}

            {tab === "links" ? links.length ? <div className="space-y-3">{links.map(({ message, url }, index) => <a key={`${message.id}-${index}`} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-[22px] bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:bg-blue-50"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#0057ff]"><Link2 size={21} /></span><span className="min-w-0 flex-1"><span className="block truncate font-black text-[#0057ff]">{url}</span><span className="mt-1 block text-xs font-bold text-slate-500">{message.senderName || "Участник"} · {displayDate(message.createdAt)}</span></span></a>)}</div> : <Empty title="Ссылок пока нет" /> : null}
          </div>
        </section>
      </div>
      <style jsx>{`
        @keyframes groupInfoToolFloat {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(-7deg); opacity: .22; }
          50% { transform: translate3d(0, -11px, 0) rotate(5deg); opacity: .4; }
        }
        .group-info-tool { animation: groupInfoToolFloat 7s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .group-info-tool { animation: none !important; }
        }
      `}</style>
    </main>
  );
}

function Empty({ title }: { title: string }) {
  return <div className="rounded-[24px] border border-dashed border-blue-200 bg-blue-50/45 p-8 text-center"><Pin className="mx-auto text-[#0057ff]" size={28} /><p className="mt-3 font-black text-slate-950">{title}</p><p className="mt-1 text-sm font-bold text-slate-500">Всё появится здесь автоматически.</p></div>;
}
