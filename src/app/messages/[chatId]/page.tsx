"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { getApiUrl } from "@/lib/getApiUrl";
import type { Timestamp } from "firebase/firestore";
import {
  addDoc,
  collection,
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
  ImagePlus,
  Loader2,
  Send,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ChatParticipant = {
  uid: string;
  displayName: string;
  avatarUrl?: string;
};

type Chat = {
  id: string;
  participantIds: string[];
  participants?: Record<string, ChatParticipant>;
  listingId?: string;
  listingTitle?: string;
  listingImageUrl?: string;
  lastMessageText?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
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
};

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const chatId = String(params.chatId);

  const { user, profile, loading } = useAuth();

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const otherId = useMemo(() => {
    if (!chat || !user) return "";
    return chat.participantIds.find((uid) => uid !== user.uid) || "";
  }, [chat, user]);

  const other = otherId ? chat?.participants?.[otherId] : null;

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push("/auth");
      return;
    }

    const currentUser = user;

    async function loadChat() {
      try {
        const chatRef = doc(db, "chats", chatId);
        const snap = await getDoc(chatRef);

        if (!snap.exists()) {
          setError("Чат не найден.");
          setPageLoading(false);
          return;
        }

        const data = {
          id: snap.id,
          ...snap.data(),
        } as Chat;

        if (!data.participantIds.includes(currentUser.uid)) {
          setError("У тебя нет доступа к этому чату.");
          setPageLoading(false);
          return;
        }

        setChat(data);
      } catch (err) {
        console.error(err);
        setError("Не получилось открыть чат.");
      } finally {
        setPageLoading(false);
      }
    }

    loadChat();
  }, [chatId, loading, router, user]);

  useEffect(() => {
    if (!user || !chat) return;

    const messagesRef = collection(db, "chats", chatId, "messages");
    const q = query(messagesRef, orderBy("createdAt", "asc"));

    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data(),
      })) as ChatMessage[];

      setMessages(data);
    });

    return () => unsub();
  }, [chat, chatId, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Можно отправлять только изображения.");
      e.target.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Фото слишком большое. Максимум 10 МБ.");
      e.target.value = "";
      return;
    }

    setError("");
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    e.target.value = "";
  }

  function removeImage() {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    setImageFile(null);
    setImagePreview("");
  }

  async function uploadImage(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(getApiUrl("/api/chat-upload"), {
      method: "POST",
      body: formData,
    });

    const textResponse = await response.text();

    let data;

    try {
      data = textResponse ? JSON.parse(textResponse) : null;
    } catch {
      throw new Error("API /api/chat-upload не вернул JSON.");
    }

    if (!response.ok) {
      throw new Error(data?.error || "Не получилось загрузить фото.");
    }

    return data as {
      url: string;
      path: string;
      name: string;
      type: "image";
    };
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!user || !chat) return;

    const cleanText = text.trim();

    if (!cleanText && !imageFile) return;

    setSending(true);

    try {
      let uploadedImage:
        | {
            url: string;
            path: string;
            name: string;
            type: "image";
          }
        | null = null;

      if (imageFile) {
        uploadedImage = await uploadImage(imageFile);
      }

      const senderName =
        profile?.displayName || user.displayName || user.email || "Пользователь";

      const senderAvatarUrl = profile?.avatarUrl || user.photoURL || "";

      const messageType =
        cleanText && uploadedImage ? "mixed" : uploadedImage ? "image" : "text";

      await addDoc(collection(db, "chats", chatId, "messages"), {
        senderId: user.uid,
        senderName,
        senderAvatarUrl,
        text: cleanText,
        imageUrl: uploadedImage?.url || "",
        imagePath: uploadedImage?.path || "",
        type: messageType,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "chats", chatId), {
        lastMessageText: cleanText || "Фото",
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        [`participants.${user.uid}.displayName`]: senderName,
        [`participants.${user.uid}.avatarUrl`]: senderAvatarUrl,
      });

      setText("");
      removeImage();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Не получилось отправить сообщение."
      );
    } finally {
      setSending(false);
    }
  }

  if (loading || pageLoading) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-5 py-10">
        <div className="mx-auto max-w-4xl">Загрузка...</div>
      </main>
    );
  }

  if (error && !chat) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-5 py-10">
        <div className="mx-auto max-w-xl rounded-[30px] bg-white p-8 text-center shadow-sm">
          <h1 className="text-3xl font-black text-gray-950">{error}</h1>

          <Link href="/messages" className="btn-primary mt-6 inline-flex">
            К сообщениям
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-3 py-5 sm:px-5">
      <div className="mx-auto flex h-[calc(100vh-40px)] max-w-4xl flex-col overflow-hidden rounded-[30px] bg-white shadow-sm">
        <header className="flex items-center gap-4 border-b border-gray-100 p-4">
          <Link
            href="/messages"
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 text-gray-700"
          >
            <ArrowLeft size={22} />
          </Link>

          <Link
            href={otherId ? `/user/${otherId}` : "/messages"}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-[#0057ff]">
              {other?.avatarUrl ? (
                <img
                  src={other.avatarUrl}
                  alt={other.displayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserRound size={24} />
              )}
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-lg font-black text-gray-950">
                {other?.displayName || "Пользователь"}
              </h1>

              {chat?.listingTitle && (
                <p className="truncate text-sm font-bold text-[#0057ff]">
                  {chat.listingTitle}
                </p>
              )}
            </div>
          </Link>
        </header>

        <section className="flex-1 space-y-4 overflow-y-auto bg-[#f5f7fb] p-4">
          {messages.length === 0 ? (
            <div className="rounded-[26px] bg-white p-8 text-center">
              <h2 className="text-2xl font-black text-gray-950">
                Начните переписку
              </h2>

              <p className="mt-2 text-gray-500">
                Можно отправлять текст и фотографии.
              </p>
            </div>
          ) : (
            messages.map((message) => {
              const isMine = message.senderId === user?.uid;

              return (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    isMine ? "justify-end" : "justify-start"
                  }`}
                >
                  {!isMine && (
                    <Link
                      href={`/user/${message.senderId}`}
                      className="mt-auto flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-[#0057ff]"
                    >
                      {message.senderAvatarUrl ? (
                        <img
                          src={message.senderAvatarUrl}
                          alt={message.senderName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <UserRound size={18} />
                      )}
                    </Link>
                  )}

                  <div
                    className={`max-w-[78%] rounded-[24px] p-3 ${
                      isMine
                        ? "rounded-br-md bg-[#0057ff] text-white"
                        : "rounded-bl-md bg-white text-gray-950"
                    }`}
                  >
                    {!isMine && (
                      <p className="mb-1 text-xs font-black text-[#0057ff]">
                        {message.senderName}
                      </p>
                    )}

                    {message.imageUrl && (
                      <a href={message.imageUrl} target="_blank">
                        <img
                          src={message.imageUrl}
                          alt="Фото в сообщении"
                          className="mb-2 max-h-80 rounded-2xl object-cover"
                        />
                      </a>
                    )}

                    {message.text && (
                      <p className="whitespace-pre-wrap leading-6">
                        {message.text}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}

          <div ref={bottomRef} />
        </section>

        {error && (
          <p className="mx-4 mt-3 rounded-2xl bg-red-50 p-3 text-sm font-black text-red-600">
            {error}
          </p>
        )}

        {imagePreview && (
          <div className="border-t border-gray-100 p-4">
            <div className="relative w-fit">
              <img
                src={imagePreview}
                alt="Превью"
                className="h-24 w-24 rounded-2xl object-cover"
              />

              <button
                type="button"
                onClick={removeImage}
                className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}

        <form
          onSubmit={handleSend}
          className="flex gap-3 border-t border-gray-100 p-4"
        >
          <label className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-blue-50 text-[#0057ff]">
            <ImagePlus size={23} />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageChange}
            />
          </label>

          <textarea
            className="input min-h-12 flex-1 resize-none py-3"
            placeholder="Написать сообщение..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
          />

          <button
            type="submit"
            disabled={sending || (!text.trim() && !imageFile)}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0057ff] text-white disabled:opacity-50"
          >
            {sending ? (
              <Loader2 className="animate-spin" size={22} />
            ) : (
              <Send size={22} />
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
