"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import type { Timestamp } from "firebase/firestore";
import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  MessageCircle,
  Mic2,
  Pin,
  Search,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ChatParticipant = {
  uid?: string;
  displayName?: string;
  name?: string;
  avatarUrl?: string;
  photoURL?: string;
};

type Chat = {
  id: string;
  participantIds?: string[];
  participants?: Record<string, ChatParticipant> | string[];
  users?: Record<string, ChatParticipant>;
  listingId?: string;
  listingTitle?: string;
  listingImageUrl?: string;
  lastMessageText?: string;
  lastMessageType?: "text" | "image" | "video" | "audio";
  lastMessageAt?: Timestamp;
  updatedAt?: Timestamp;
  createdAt?: Timestamp;
  pinnedBy?: string[] | Record<string, boolean> | string | null;
};


function getPinnedUserIds(
  value: Chat["pinnedBy"]
): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") return [value];
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([, enabled]) => enabled === true)
      .map(([uid]) => uid);
  }
  return [];
}

function isChatPinned(chat: Chat, uid: string) {
  return getPinnedUserIds(chat.pinnedBy).includes(uid);
}

function getParticipantIds(chat: Chat) {
  if (Array.isArray(chat.participantIds)) return chat.participantIds;
  if (Array.isArray(chat.participants)) return chat.participants;
  if (chat.users) return Object.keys(chat.users);
  if (chat.participants && !Array.isArray(chat.participants)) {
    return Object.keys(chat.participants);
  }
  return [];
}

function getOtherParticipant(chat: Chat, myUid: string) {
  const otherId = getParticipantIds(chat).find((uid) => uid !== myUid) || "";
  const participantMap =
    chat.participants && !Array.isArray(chat.participants)
      ? chat.participants
      : undefined;
  const participant =
    (otherId ? participantMap?.[otherId] : undefined) ||
    (otherId ? chat.users?.[otherId] : undefined);

  return {
    id: otherId,
    displayName:
      participant?.displayName || participant?.name || "Пользователь",
    avatarUrl: participant?.avatarUrl || participant?.photoURL || "",
  };
}

function getTime(chat: Chat) {
  return (
    chat.updatedAt?.toMillis?.() ||
    chat.lastMessageAt?.toMillis?.() ||
    chat.createdAt?.toMillis?.() ||
    0
  );
}

function formatTime(chat: Chat) {
  const ms = getTime(chat);
  if (!ms) return "";

  const date = new Date(ms);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();

  if (isToday) {
    return new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function chatPreview(chat: Chat) {
  if (chat.lastMessageText) return chat.lastMessageText;
  if (chat.lastMessageType === "audio") return "Голосовое сообщение";
  if (chat.lastMessageType === "video") return "Видео";
  if (chat.lastMessageType === "image") return "Фото";
  return "Чат создан";
}

export default function MessagesPage() {
  const { user, loading } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [search, setSearch] = useState("");
  const [pinningId, setPinningId] = useState("");

  useEffect(() => {
    if (!user) return;

    const chatsQuery = query(
      collection(db, "chats"),
      where("participantIds", "array-contains", user.uid)
    );

    return onSnapshot(chatsQuery, (snapshot) => {
      setChats(
        snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as Chat[]
      );
    });
  }, [user]);

  const sortedChats = useMemo(() => {
    if (!user) return [];

    const value = search.trim().toLowerCase();
    const visible = chats.filter((chat) => {
      if (!value) return true;
      const other = getOtherParticipant(chat, user.uid);

      return (
        other.displayName.toLowerCase().includes(value) ||
        chat.listingTitle?.toLowerCase().includes(value) ||
        chatPreview(chat).toLowerCase().includes(value)
      );
    });

    return [...visible].sort((a, b) => {
      const aPinned = isChatPinned(a, user.uid) ? 1 : 0;
      const bPinned = isChatPinned(b, user.uid) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return getTime(b) - getTime(a);
    });
  }, [chats, search, user]);

  async function toggleChatPin(chat: Chat) {
    if (!user || pinningId) return;

    try {
      setPinningId(chat.id);
      const pinnedUserIds = getPinnedUserIds(chat.pinnedBy);
      const pinned = pinnedUserIds.includes(user.uid);
      const nextPinnedBy = pinned
        ? pinnedUserIds.filter((uid) => uid !== user.uid)
        : Array.from(new Set([...pinnedUserIds, user.uid]));

      await updateDoc(doc(db, "chats", chat.id), {
        pinnedBy: nextPinnedBy,
      });
    } finally {
      setPinningId("");
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f4f7ff] px-3 py-6 sm:px-5 sm:py-10">
        <div className="mx-auto max-w-6xl animate-pulse rounded-[24px] bg-white p-5 sm:rounded-[34px] sm:p-8 text-gray-400 shadow-sm">
          Загружаем сообщения...
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#f4f7ff] px-3 py-6 sm:px-5 sm:py-10">
        <div className="mx-auto max-w-xl rounded-[24px] bg-white p-6 sm:rounded-[34px] sm:p-9 text-center shadow-[0_24px_70px_rgba(15,23,42,0.10)]">
          <MessageCircle className="mx-auto text-[#0057ff]" size={46} />
          <h1 className="mt-5 text-2xl font-black text-gray-950 sm:text-3xl">
            Сначала войди в аккаунт
          </h1>
          <p className="mt-3 text-gray-500">
            Сообщения доступны только авторизованным пользователям.
          </p>
          <Link href="/auth" className="btn-primary mt-6 inline-flex">
            Войти
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#f4f7ff] px-3 py-4 sm:px-6 sm:py-9">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-28 top-24 h-80 w-80 rounded-full bg-blue-200/35 blur-3xl" />
        <div className="absolute -right-24 top-80 h-96 w-96 rounded-full bg-indigo-200/30 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <section className="messages-hero relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#0057ff] via-[#1266ff] to-[#4c6fff] px-4 py-6 text-white shadow-[0_24px_70px_rgba(0,87,255,0.25)] sm:rounded-[40px] sm:px-10 sm:py-10">
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-cyan-300/15 blur-2xl" />

          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/14 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] ring-1 ring-white/20 backdrop-blur">
                <Sparkles size={15} />
                Стройка.ру
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight sm:mt-5 sm:text-5xl">
                Сообщения
              </h1>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-blue-50 sm:text-base">
                Переписка с заказчиками и исполнителями — быстро, удобно и в одном месте.
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-[24px] bg-white/12 px-4 py-3 ring-1 ring-white/20 backdrop-blur-md">
              <MessageCircle size={22} />
              <div>
                <p className="text-2xl font-black leading-none">{chats.length}</p>
                <p className="mt-1 text-xs font-bold text-blue-100">активных чатов</p>
              </div>
            </div>
          </div>
        </section>

        <section className="messages-panel mt-4 rounded-[24px] border border-white/80 bg-white/90 p-3 shadow-[0_26px_80px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:mt-6 sm:rounded-[38px] sm:p-6">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-400"
              size={21}
            />
            <input
              className="h-14 w-full rounded-[22px] border border-slate-200 bg-slate-50/80 pl-14 pr-12 text-sm font-bold text-slate-900 outline-none transition duration-300 placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:shadow-[0_0_0_5px_rgba(0,87,255,0.08)] sm:h-16 sm:rounded-[24px] sm:text-base"
              placeholder="Поиск по чатам"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                aria-label="Очистить поиск"
              >
                <X size={17} />
              </button>
            ) : null}
          </div>

          <div className="mt-5 space-y-3">
            {sortedChats.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-blue-200 bg-gradient-to-br from-blue-50 to-white p-6 sm:rounded-[28px] sm:p-10 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-white text-[#0057ff] shadow-sm">
                  <MessageCircle size={32} />
                </div>
                <h2 className="mt-5 text-2xl font-black text-gray-950">
                  {search ? "Ничего не найдено" : "Чатов пока нет"}
                </h2>
                <p className="mx-auto mt-2 max-w-md text-gray-500">
                  {search
                    ? "Попробуй изменить запрос."
                    : "Открой объявление другого пользователя и нажми «Написать»."}
                </p>
              </div>
            ) : (
              sortedChats.map((chat, index) => {
                const other = getOtherParticipant(chat, user.uid);
                const pinned = isChatPinned(chat, user.uid);
                const preview = chatPreview(chat);

                return (
                  <article
                    key={chat.id}
                    className="chat-card group relative overflow-hidden rounded-[20px] sm:rounded-[25px] border border-slate-100 bg-white shadow-[0_8px_26px_rgba(15,23,42,0.045)] transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_18px_45px_rgba(0,87,255,0.12)]"
                    style={{ animationDelay: `${Math.min(index * 45, 360)}ms` }}
                  >
                    <Link
                      href={`/messages/${chat.id}`}
                      className="flex min-w-0 items-center gap-3 p-3.5 pr-14 sm:gap-4 sm:p-4 sm:pr-16"
                    >
                      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[20px] bg-gradient-to-br from-blue-50 to-indigo-100 text-[#0057ff] ring-1 ring-blue-100 sm:h-16 sm:w-16 sm:rounded-[22px]">
                        {other.avatarUrl ? (
                          <img
                            src={other.avatarUrl}
                            alt={other.displayName}
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <UserRound size={28} />
                        )}
                        <span className="absolute bottom-1 right-1 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h2 className="truncate text-base font-black text-slate-950 sm:text-lg">
                                {other.displayName}
                              </h2>
                              {pinned ? (
                                <Pin className="shrink-0 text-[#0057ff]" size={14} fill="currentColor" />
                              ) : null}
                            </div>
                            {chat.listingTitle ? (
                              <p className="mt-0.5 truncate text-xs font-black text-[#0057ff] sm:text-sm">
                                {chat.listingTitle}
                              </p>
                            ) : null}
                          </div>
                          <time className="shrink-0 text-[11px] font-black text-slate-400 sm:text-xs">
                            {formatTime(chat)}
                          </time>
                        </div>

                        <div className="mt-2 flex min-w-0 items-center gap-2">
                          {chat.lastMessageType === "audio" || preview.includes("Голосовое") ? (
                            <Mic2 className="shrink-0 text-[#0057ff]" size={15} />
                          ) : null}
                          <p className="truncate text-sm font-semibold text-slate-500 sm:text-base">
                            {preview}
                          </p>
                        </div>
                      </div>
                    </Link>

                    <button
                      type="button"
                      onClick={() => toggleChatPin(chat)}
                      disabled={pinningId === chat.id}
                      className={`absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-2xl transition duration-300 sm:right-4 ${
                        pinned
                          ? "bg-blue-50 text-[#0057ff] opacity-100"
                          : "bg-slate-50 text-slate-400 opacity-100 hover:bg-blue-50 hover:text-[#0057ff] sm:opacity-0 sm:group-hover:opacity-100"
                      } disabled:opacity-50`}
                      title={pinned ? "Открепить чат" : "Закрепить чат"}
                      aria-label={pinned ? "Открепить чат" : "Закрепить чат"}
                    >
                      <Pin size={18} fill={pinned ? "currentColor" : "none"} />
                    </button>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>

      <style jsx>{`
        .messages-hero {
          animation: messagesRise 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .messages-panel {
          animation: messagesRise 600ms 70ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .chat-card {
          animation: chatCardIn 480ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes messagesRise {
          from {
            opacity: 0;
            transform: translateY(18px) scale(0.99);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes chatCardIn {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .messages-hero,
          .messages-panel,
          .chat-card {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}
