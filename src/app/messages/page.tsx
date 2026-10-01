"use client";

import { useAuth } from "@/components/AuthProvider";
import ToolsBackdrop from "@/components/ToolsBackdrop";
import { db } from "@/lib/firebase";
import type { Timestamp } from "firebase/firestore";
import {
  collection,
  doc,
  FieldPath,
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
  Plus,
  UserRound,
  UsersRound,
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
  chatType?: "direct" | "group";
  isGroup?: boolean;
  groupTitle?: string;
  groupAvatarUrl?: string;
  participantIds?: string[];
  participants?: Record<string, ChatParticipant> | string[];
  users?: Record<string, ChatParticipant> | string[];
  buyerId?: string;
  sellerId?: string;
  clientId?: string;
  customerId?: string;
  contractorId?: string;
  authorId?: string;
  ownerId?: string;
  listingId?: string;
  listingTitle?: string;
  listingImageUrl?: string;
  lastMessageText?: string;
  lastMessageType?: "text" | "image" | "video" | "audio";
  lastSenderId?: string;
  lastMessageAt?: Timestamp;
  updatedAt?: Timestamp;
  createdAt?: Timestamp;
  pinnedBy?: string[] | Record<string, boolean> | string | null;
  unreadBy?: string[] | Record<string, boolean>;
  unreadCounts?: Record<string, number>;
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

function hasUserMarker(
  value: string[] | Record<string, boolean> | undefined,
  uid: string
) {
  if (!value || !uid) return false;
  if (Array.isArray(value)) return value.includes(uid);
  return value[uid] === true;
}

function getUnreadCount(chat: Chat, uid: string) {
  const saved = Number(chat.unreadCounts?.[uid] || 0);
  if (Number.isFinite(saved) && saved > 0) return Math.floor(saved);
  return hasUserMarker(chat.unreadBy, uid) ? 1 : 0;
}

function getParticipantIds(chat: Chat) {
  const ids = new Set<string>();

  if (Array.isArray(chat.participantIds)) {
    chat.participantIds.forEach((uid) => {
      if (typeof uid === "string" && uid) ids.add(uid);
    });
  }

  if (Array.isArray(chat.participants)) {
    chat.participants.forEach((uid) => {
      if (typeof uid === "string" && uid) ids.add(uid);
    });
  }

  if (Array.isArray(chat.users)) {
    chat.users.forEach((uid) => {
      if (typeof uid === "string" && uid) ids.add(uid);
    });
  } else if (chat.users) {
    Object.keys(chat.users).forEach((uid) => ids.add(uid));
  }

  if (chat.participants && !Array.isArray(chat.participants)) {
    Object.keys(chat.participants).forEach((uid) => ids.add(uid));
  }

  [
    chat.buyerId,
    chat.sellerId,
    chat.clientId,
    chat.customerId,
    chat.contractorId,
    chat.authorId,
    chat.ownerId,
  ].forEach((uid) => {
    if (typeof uid === "string" && uid) ids.add(uid);
  });

  return Array.from(ids);
}

function isGroupChat(chat: Chat) {
  return chat.chatType === "group" || chat.isGroup === true;
}

function memberCountLabel(value: number) {
  const count = Math.max(0, Math.floor(value || 0));
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} участников`;
  if (last === 1) return `${count} участник`;
  if (last >= 2 && last <= 4) return `${count} участника`;
  return `${count} участников`;
}

function getChatDisplay(chat: Chat, myUid: string) {
  if (isGroupChat(chat)) {
    return {
      id: chat.id,
      displayName: chat.groupTitle?.trim() || "Групповой чат",
      avatarUrl: chat.groupAvatarUrl || "",
      isGroup: true,
    };
  }

  const otherId = getParticipantIds(chat).find((uid) => uid !== myUid) || "";
  const participantMap =
    chat.participants && !Array.isArray(chat.participants)
      ? chat.participants
      : undefined;
  const usersMap = chat.users && !Array.isArray(chat.users) ? chat.users : undefined;
  const participant =
    (otherId ? participantMap?.[otherId] : undefined) ||
    (otherId ? usersMap?.[otherId] : undefined);

  return {
    id: otherId,
    displayName:
      participant?.displayName || participant?.name || "Пользователь",
    avatarUrl: participant?.avatarUrl || participant?.photoURL || "",
    isGroup: false,
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
  const [filter, setFilter] = useState<"all" | "unread" | "groups">("all");
  const { user, loading } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [chatsError, setChatsError] = useState("");
  const [search, setSearch] = useState("");
  const [pinningId, setPinningId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!user) {
      setChats([]);
      setChatsLoading(false);
      return;
    }

    setChatsLoading(true);
    setChatsError("");

    const chatsCollection = collection(db, "chats");
    const sources = [
      {
        key: "participantIds",
        value: query(
          chatsCollection,
          where("participantIds", "array-contains", user.uid)
        ),
      },
      {
        key: "participantsList",
        value: query(
          chatsCollection,
          where("participants", "array-contains", user.uid)
        ),
      },
      {
        key: "participantsMap",
        value: query(
          chatsCollection,
          where(new FieldPath("participants", user.uid, "uid"), "==", user.uid)
        ),
      },
      {
        key: "usersMap",
        value: query(
          chatsCollection,
          where(new FieldPath("users", user.uid, "uid"), "==", user.uid)
        ),
      },
      {
        key: "usersList",
        value: query(
          chatsCollection,
          where("users", "array-contains", user.uid)
        ),
      },
      {
        key: "buyerId",
        value: query(chatsCollection, where("buyerId", "==", user.uid)),
      },
      {
        key: "sellerId",
        value: query(chatsCollection, where("sellerId", "==", user.uid)),
      },
      {
        key: "clientId",
        value: query(chatsCollection, where("clientId", "==", user.uid)),
      },
      {
        key: "customerId",
        value: query(chatsCollection, where("customerId", "==", user.uid)),
      },
      {
        key: "contractorId",
        value: query(chatsCollection, where("contractorId", "==", user.uid)),
      },
      {
        key: "authorId",
        value: query(chatsCollection, where("authorId", "==", user.uid)),
      },
      {
        key: "ownerId",
        value: query(chatsCollection, where("ownerId", "==", user.uid)),
      },
    ];

    const resultBySource = new Map<string, Map<string, Chat>>();
    const settledSources = new Set<string>();
    const failedSources = new Set<string>();
    let disposed = false;

    function publishMergedChats() {
      if (disposed) return;

      const merged = new Map<string, Chat>();
      resultBySource.forEach((sourceChats) => {
        sourceChats.forEach((chat, id) => merged.set(id, chat));
      });

      setChats(Array.from(merged.values()));

      if (settledSources.size === sources.length) {
        setChatsLoading(false);
        setChatsError(
          failedSources.size === sources.length
            ? "Не получилось загрузить переписки. Проверьте доступ к Firestore и повторите попытку."
            : ""
        );
      }
    }

    const unsubscribes = sources.map((source) =>
      onSnapshot(
        source.value,
        (snapshot) => {
          const sourceChats = new Map<string, Chat>();
          snapshot.docs.forEach((item) => {
            sourceChats.set(item.id, {
              id: item.id,
              ...item.data(),
            } as Chat);
          });

          resultBySource.set(source.key, sourceChats);
          settledSources.add(source.key);
          failedSources.delete(source.key);
          publishMergedChats();
        },
        (snapshotError) => {
          console.error(
            `[messages] Firestore query failed (${source.key})`,
            snapshotError
          );
          resultBySource.set(source.key, new Map());
          settledSources.add(source.key);
          failedSources.add(source.key);
          publishMergedChats();
        }
      )
    );

    return () => {
      disposed = true;
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [reloadKey, user]);

  const sortedChats = useMemo(() => {
    if (!user) return [];

    const value = search.trim().toLowerCase();
    const visible = chats.filter((chat) => {
      if (filter === "unread" && getUnreadCount(chat, user.uid) === 0) return false;
      if (filter === "groups" && !isGroupChat(chat)) return false;
      if (!value) return true;
      const other = getChatDisplay(chat, user.uid);

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
  }, [chats, search, user, filter]);

  const totalUnread = useMemo(
    () =>
      user
        ? chats.reduce((sum, chat) => sum + getUnreadCount(chat, user.uid), 0)
        : 0,
    [chats, user]
  );

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

  if (loading || chatsLoading) {
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
    <main className="min-h-screen bg-[#f5f7fb] px-3 py-5 sm:px-6 sm:py-9">
      <div className="relative mx-auto max-w-6xl">
        <section className="messages-hero relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#004bdc] to-[#1768ff] px-5 py-7 text-white shadow-lg shadow-blue-900/10 sm:px-8 sm:py-8">
          <ToolsBackdrop />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Сообщения
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-blue-100">
                <span className="inline-flex items-center gap-2"><MessageCircle size={16} />Чатов: {chats.length}</span>
                {totalUnread > 0 && <span className="rounded-lg bg-white/15 px-2.5 py-1 font-bold text-white">Непрочитанных: {totalUnread}</span>}
              </div>
            </div>

            <div className="shrink-0">
              <Link
                href="/messages/new-group"
                className="group inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-white px-5 py-3 font-bold text-[#0057ff] shadow-sm transition duration-200 hover:bg-blue-50 motion-safe:active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:w-auto"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-blue-50 transition duration-300 group-hover:bg-blue-100">
                  <Plus size={21} strokeWidth={2.5} />
                </span>
                <span className="pr-1 text-sm sm:text-base">Создать группу</span>
              </Link>

            </div>
          </div>
        </section>

        <section aria-label="Список чатов" className="messages-panel mt-5 rounded-[28px] border border-slate-200/80 bg-white p-3 shadow-sm sm:p-6">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-400"
              size={21}
            />
            <input
              className="h-14 w-full rounded-[22px] border border-slate-200 bg-slate-50/80 pl-14 pr-12 text-sm font-bold text-slate-900 outline-none transition duration-300 placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:shadow-[0_0_0_5px_rgba(0,87,255,0.08)] sm:h-16 sm:rounded-[24px] sm:text-base"
              placeholder="Поиск по чатам"
              aria-label="Поиск по чатам"
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

          <div className="mt-4 flex flex-wrap gap-2 border-b border-slate-100 pb-4" aria-label="Фильтр чатов">
            {([
              ["all", "Все", chats.length],
              ["unread", "Непрочитанные", chats.filter((chat) => getUnreadCount(chat, user.uid) > 0).length],
              ["groups", "Группы", chats.filter(isGroupChat).length],
            ] as const).map(([value, label, count]) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0057ff] sm:text-sm ${filter === value ? "bg-[#0057ff] text-white" : "bg-slate-50 text-slate-600 hover:bg-blue-50"}`}>
                {label}<span className={`rounded-md px-1.5 py-0.5 text-[11px] ${filter === value ? "bg-white/15" : "bg-white text-slate-500"}`}>{count}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {chatsError ? (
              <div className="rounded-[22px] border border-red-200 bg-red-50 p-6 text-center sm:rounded-[28px] sm:p-10">
                <MessageCircle className="mx-auto text-red-500" size={34} />
                <h2 className="mt-4 text-2xl font-black text-slate-950">
                  Не удалось загрузить сообщения
                </h2>
                <p className="mx-auto mt-2 max-w-lg font-semibold text-slate-600">
                  {chatsError}
                </p>
                <button
                  type="button"
                  onClick={() => setReloadKey((value) => value + 1)}
                  className="btn-primary mt-5"
                >
                  Повторить
                </button>
              </div>
            ) : sortedChats.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-blue-200 bg-gradient-to-br from-blue-50 to-white p-6 sm:rounded-[28px] sm:p-10 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-white text-[#0057ff] shadow-sm">
                  <MessageCircle size={32} />
                </div>
                <h2 className="mt-5 text-2xl font-black text-gray-950">
                  {search ? "Ничего не найдено" : filter === "unread" ? "Всё прочитано" : filter === "groups" ? "Групп пока нет" : "Чатов пока нет"}
                </h2>
                <p className="mx-auto mt-2 max-w-md text-gray-500">
                  {search
                    ? "Попробуй изменить запрос."
                    : filter === "unread" ? "Здесь появятся чаты с новыми сообщениями."
                    : filter === "groups" ? "Создайте группу и пригласите участников по ссылке."
                    : "Откройте объявление и нажмите «Написать» или создайте свою группу."}
                </p>
                {!search && filter !== "unread" && <Link href="/messages/new-group" className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#0057ff] px-5 font-bold text-white"><Plus size={18} />Создать группу</Link>}
              </div>
            ) : (
              sortedChats.map((chat, index) => {
                const other = getChatDisplay(chat, user.uid);
                const pinned = isChatPinned(chat, user.uid);
                const preview = chatPreview(chat);
                const unreadCount = getUnreadCount(chat, user.uid);
                const unread = unreadCount > 0;
                const participantCount = getParticipantIds(chat).length;

                return (
                  <article
                    key={chat.id}
                    className={`chat-card group relative overflow-hidden rounded-2xl border transition-colors duration-200 hover:border-blue-200 hover:bg-blue-50/40 focus-within:ring-2 focus-within:ring-blue-300 ${
                      unread
                        ? "border-blue-200 bg-blue-50/60"
                        : "border-slate-100 bg-white"
                    }`}
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
                          other.isGroup ? <UsersRound size={28} /> : <UserRound size={28} />
                        )}
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
                            {other.isGroup ? (
                              <p className="mt-0.5 flex items-center gap-1 text-[11px] font-extrabold text-blue-600 sm:text-xs">
                                <UsersRound size={13} />
                                {memberCountLabel(participantCount)}
                              </p>
                            ) : null}
                            {chat.listingTitle ? (
                              <p className="mt-0.5 truncate text-xs font-black text-[#0057ff] sm:text-sm">
                                {chat.listingTitle}
                              </p>
                            ) : null}
                          </div>
                          <time className={`shrink-0 text-[11px] font-black sm:text-xs ${unread ? "text-[#0057ff]" : "text-slate-400"}`}>
                            {formatTime(chat)}
                          </time>
                        </div>

                        <div className="mt-2 flex min-w-0 items-center gap-2">
                          {chat.lastMessageType === "audio" || preview.includes("Голосовое") ? (
                            <Mic2 className="shrink-0 text-[#0057ff]" size={15} />
                          ) : null}
                          <p className={`min-w-0 flex-1 truncate text-sm sm:text-base ${unread ? "font-black text-slate-900" : "font-semibold text-slate-500"}`}>
                            {chat.lastSenderId === user.uid ? "Вы: " : ""}
                            {preview}
                          </p>
                          {unread ? (
                            <span className="unread-badge flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full border-2 border-white bg-[#0057ff] px-1.5 text-[10px] font-black text-white shadow-[0_5px_14px_rgba(0,87,255,0.28)]">
                              {unreadCount > 99 ? "99+" : unreadCount}
                            </span>
                          ) : null}
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
                          : "bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-[#0057ff]"
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
        .unread-badge {
          animation: unreadBadgeIn 260ms cubic-bezier(0.22, 1, 0.36, 1) both;
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
        @keyframes unreadBadgeIn {
          from {
            opacity: 0;
            transform: scale(0.72);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .messages-hero,
          .messages-panel,
          .chat-card,
          .unread-badge {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}
