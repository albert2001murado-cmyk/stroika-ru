"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { getApiUrl } from "@/lib/getApiUrl";
import type { Timestamp } from "firebase/firestore";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Edit3,
  ImagePlus,
  Loader2,
  MoreVertical,
  Pin,
  PinOff,
  Send,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

type ChatParticipant = { uid: string; displayName: string; avatarUrl?: string };
type Chat = {
  id: string;
  participantIds: string[];
  participants?: Record<string, ChatParticipant>;
  listingId?: string;
  listingTitle?: string;
  listingImageUrl?: string;
};

type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  text?: string;
  imageUrl?: string;
  imagePath?: string;
  type: "text" | "image" | "mixed";
  createdAt?: Timestamp;
  editedAt?: Timestamp;
  hiddenFor?: string[] | Record<string, boolean>;
  pinned?: boolean;
  readBy?: string[] | Record<string, boolean>;
  deliveredTo?: string[] | Record<string, boolean>;
};

function hasUserMarker(
  value: string[] | Record<string, boolean> | undefined,
  uid: string
) {
  if (!value || !uid) return false;

  if (Array.isArray(value)) {
    return value.includes(uid);
  }

  return value[uid] === true;
}

function formatTime(value?: Timestamp) {
  if (!value?.toDate) return "";
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(value.toDate());
}

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const chatId = String(params.chatId);
  const { user, profile, loading } = useAuth();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState("");
  const [openMenuId, setOpenMenuId] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const otherId = useMemo(
    () => chat?.participantIds.find((uid) => uid !== user?.uid) || "",
    [chat, user?.uid]
  );
  const other = otherId ? chat?.participants?.[otherId] : null;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/auth");
      return;
    }

    getDoc(doc(db, "chats", chatId))
      .then((snap) => {
        if (!snap.exists()) throw new Error("Чат не найден.");
        const data = { id: snap.id, ...snap.data() } as Chat;
        if (!data.participantIds.includes(user.uid)) throw new Error("Нет доступа к чату.");
        setChat(data);
      })
      .catch((err) => setError(err.message || "Не получилось открыть чат."))
      .finally(() => setPageLoading(false));
  }, [chatId, loading, router, user]);

  useEffect(() => {
    if (!user || !chat) return;

    const q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc"));
    return onSnapshot(q, async (snapshot) => {
      const data = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as ChatMessage[];
      setMessages(
        data.filter((item) => !hasUserMarker(item.hiddenFor, user.uid))
      );

      const unread = data.filter(
        (item) =>
          item.senderId !== user.uid &&
          !hasUserMarker(item.readBy, user.uid)
      );

      await Promise.all(
        unread.map((item) => {
          const messageRef = doc(db, "chats", chatId, "messages", item.id);

          const readUpdate = Array.isArray(item.readBy)
            ? { readBy: arrayUnion(user.uid) }
            : { [`readBy.${user.uid}`]: true };

          const deliveredUpdate = Array.isArray(item.deliveredTo)
            ? { deliveredTo: arrayUnion(user.uid) }
            : { [`deliveredTo.${user.uid}`]: true };

          return updateDoc(messageRef, {
            ...readUpdate,
            ...deliveredUpdate,
            updatedAt: serverTimestamp(),
          }).catch(() => undefined);
        })
      );
    });
  }, [chat, chatId, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Можно отправлять только изображения.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Фото слишком большое. Максимум 10 МБ.");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError("");
    event.target.value = "";
  }

  function removeImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview("");
  }

  async function uploadImage(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(getApiUrl("/api/chat-upload"), { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Не получилось загрузить фото.");
    return data as { url: string; path: string };
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    if (!user || !chat) return;

    const clean = text.trim();
    if (!clean && !imageFile) return;

    setSending(true);
    setError("");

    try {
      if (editingId) {
        await updateDoc(doc(db, "chats", chatId, "messages", editingId), {
          text: clean,
          editedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setEditingId("");
        setText("");
        return;
      }

      const uploaded = imageFile ? await uploadImage(imageFile) : null;
      const senderName = profile?.displayName || user.displayName || user.email || "Пользователь";
      const senderAvatarUrl = profile?.avatarUrl || user.photoURL || "";
      const messageType = clean && uploaded ? "mixed" : uploaded ? "image" : "text";

      await addDoc(collection(db, "chats", chatId, "messages"), {
        senderId: user.uid,
        senderName,
        senderAvatarUrl,
        text: clean,
        imageUrl: uploaded?.url || "",
        imagePath: uploaded?.path || "",
        type: messageType,
        hiddenFor: {},
        pinned: false,
        readBy: { [user.uid]: true },
        deliveredTo: { [user.uid]: true },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "chats", chatId), {
        lastMessageText: clean || "Фото",
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        [`participants.${user.uid}.displayName`]: senderName,
        [`participants.${user.uid}.avatarUrl`]: senderAvatarUrl,
      });

      setText("");
      removeImage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не получилось отправить сообщение.");
    } finally {
      setSending(false);
    }
  }

  async function togglePin(message: ChatMessage) {
    await updateDoc(doc(db, "chats", chatId, "messages", message.id), {
      pinned: !message.pinned,
      updatedAt: serverTimestamp(),
    });
    setOpenMenuId("");
  }

  function beginEdit(message: ChatMessage) {
    setEditingId(message.id);
    setText(message.text || "");
    setOpenMenuId("");
  }

  async function hideForMe(message: ChatMessage) {
    if (!user) return;

    const hiddenUpdate = Array.isArray(message.hiddenFor)
      ? { hiddenFor: arrayUnion(user.uid) }
      : { [`hiddenFor.${user.uid}`]: true };

    await updateDoc(doc(db, "chats", chatId, "messages", message.id), {
      ...hiddenUpdate,
      updatedAt: serverTimestamp(),
    });

    setOpenMenuId("");
  }

  async function deleteForEveryone(message: ChatMessage) {
    if (!confirm("Удалить сообщение у всех участников?")) return;
    await deleteDoc(doc(db, "chats", chatId, "messages", message.id));
    setOpenMenuId("");
  }

  if (loading || pageLoading) return <main className="app-page">Загрузка...</main>;
  if (error && !chat) return <main className="app-page"><div className="empty-card"><h1>{error}</h1><Link href="/messages" className="btn-primary mt-5">К сообщениям</Link></div></main>;

  const pinned = messages.filter((item) => item.pinned);

  return (
    <main className="min-h-[calc(100dvh-82px)] bg-[#f5f7fb] p-0 sm:px-5 sm:py-5">
      <div className="mx-auto flex h-[calc(100dvh-82px)] max-w-5xl flex-col overflow-hidden bg-white sm:h-[calc(100dvh-122px)] sm:rounded-[30px] sm:shadow-sm">
        <header className="flex items-center gap-3 border-b border-gray-100 p-3 sm:p-4">
          <Link href="/messages" className="icon-button"><ArrowLeft size={21} /></Link>
          <Link href={otherId ? `/user/${otherId}` : "/messages"} className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-[#0057ff] sm:h-12 sm:w-12">
              {other?.avatarUrl ? <img src={other.avatarUrl} alt={other.displayName} className="h-full w-full object-cover" /> : <UserRound size={23} />}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-black text-gray-950 sm:text-lg">{other?.displayName || "Пользователь"}</h1>
              {chat?.listingTitle && <p className="truncate text-xs font-bold text-[#0057ff] sm:text-sm">{chat.listingTitle}</p>}
            </div>
          </Link>
        </header>

        {pinned.length > 0 && (
          <div className="border-b border-blue-100 bg-blue-50 px-4 py-2">
            <div className="flex items-center gap-2 text-sm font-black text-[#0057ff]">
              <Pin size={15} />
              <span className="truncate">{pinned[pinned.length - 1].text || "Закреплённое сообщение"}</span>
            </div>
          </div>
        )}

        <section className="flex-1 space-y-3 overflow-y-auto bg-[#f5f7fb] p-3 sm:p-4">
          {messages.length === 0 ? (
            <div className="empty-card"><h3>Начните переписку</h3><p>Можно отправлять текст и фотографии.</p></div>
          ) : (
            messages.map((message) => {
              const isMine = message.senderId === user?.uid;
              const isRead = otherId
                ? hasUserMarker(message.readBy, otherId)
                : false;

              return (
                <div key={message.id} className={`group flex gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
                  <div className="relative max-w-[86%] sm:max-w-[72%]">
                    <div className={`rounded-[22px] px-4 py-3 shadow-sm ${isMine ? "rounded-br-md bg-[#0057ff] text-white" : "rounded-bl-md bg-white text-gray-950"}`}>
                      {message.imageUrl && <img src={message.imageUrl} alt="" className="mb-2 max-h-80 w-full rounded-2xl object-cover" />}
                      {message.text && <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.text}</p>}
                      <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] font-bold ${isMine ? "text-blue-100" : "text-gray-400"}`}>
                        {message.editedAt ? <span>изменено</span> : null}
                        <span>{formatTime(message.createdAt)}</span>
                        {isMine ? (isRead ? <CheckCheck size={14} /> : <Check size={14} />) : null}
                      </div>
                    </div>

                    <button type="button" onClick={() => setOpenMenuId(openMenuId === message.id ? "" : message.id)} className={`absolute top-1 flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-500 shadow-md ${isMine ? "-left-9" : "-right-9"} opacity-100 sm:opacity-0 sm:group-hover:opacity-100`}>
                      <MoreVertical size={16} />
                    </button>

                    {openMenuId === message.id && (
                      <div className={`absolute z-20 mt-1 w-52 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-gray-100 ${isMine ? "right-0" : "left-0"}`}>
                        <button type="button" onClick={() => togglePin(message)} className="chat-action">{message.pinned ? <PinOff size={17} /> : <Pin size={17} />}{message.pinned ? "Открепить" : "Закрепить"}</button>
                        {isMine && message.type === "text" && <button type="button" onClick={() => beginEdit(message)} className="chat-action"><Edit3 size={17} />Изменить</button>}
                        <button type="button" onClick={() => hideForMe(message)} className="chat-action"><Trash2 size={17} />Удалить у меня</button>
                        {isMine && <button type="button" onClick={() => deleteForEveryone(message)} className="chat-action text-red-600"><Trash2 size={17} />Удалить у всех</button>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </section>

        {imagePreview && (
          <div className="border-t border-gray-100 bg-white p-3">
            <div className="relative h-24 w-24 overflow-hidden rounded-2xl">
              <img src={imagePreview} alt="" className="h-full w-full object-cover" />
              <button type="button" onClick={removeImage} className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"><X size={15} /></button>
            </div>
          </div>
        )}

        {editingId && (
          <div className="flex items-center justify-between border-t border-blue-100 bg-blue-50 px-4 py-2 text-sm font-black text-[#0057ff]">
            <span>Редактирование сообщения</span>
            <button type="button" onClick={() => { setEditingId(""); setText(""); }}><X size={18} /></button>
          </div>
        )}

        {error && <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm font-black text-red-600">{error}</p>}

        <form onSubmit={handleSend} className="flex items-end gap-2 border-t border-gray-100 bg-white p-3 sm:p-4">
          {!editingId && (
            <label className="icon-button cursor-pointer">
              <ImagePlus size={21} />
              <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            </label>
          )}
          <textarea className="input max-h-32 min-h-12 flex-1 resize-none py-3" rows={1} placeholder={editingId ? "Изменить сообщение" : "Сообщение"} value={text} onChange={(e) => setText(e.target.value)} />
          <button disabled={sending} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0057ff] text-white disabled:opacity-60">
            {sending ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
          </button>
        </form>
      </div>
    </main>
  );
}
