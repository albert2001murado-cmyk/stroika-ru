"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import type { Timestamp } from "firebase/firestore";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { MessageCircle, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
  lastMessageAt?: Timestamp;
  updatedAt?: Timestamp;
  createdAt?: Timestamp;
};

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

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

export default function MessagesPage() {
  const { user, loading } = useAuth();

  const [chats, setChats] = useState<Chat[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "chats"),
      where("participantIds", "array-contains", user.uid)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data(),
      })) as Chat[];

      data.sort((a, b) => getTime(b) - getTime(a));
      setChats(data);
    });

    return () => unsub();
  }, [user]);

  const filteredChats = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) return chats;

    return chats.filter((chat) => {
      const otherId = chat.participantIds.find((uid) => uid !== user?.uid);
      const other = otherId ? chat.participants?.[otherId] : null;

      return (
        other?.displayName?.toLowerCase().includes(value) ||
        chat.listingTitle?.toLowerCase().includes(value) ||
        chat.lastMessageText?.toLowerCase().includes(value)
      );
    });
  }, [chats, search, user?.uid]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-5 py-10">
        <div className="mx-auto max-w-5xl">Загрузка...</div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-5 py-10">
        <div className="mx-auto max-w-xl rounded-[30px] bg-white p-8 text-center shadow-sm">
          <h1 className="text-3xl font-black text-gray-950">
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
    <main className="min-h-screen bg-[#f5f7fb] px-5 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-[34px] bg-[#0057ff] p-8 text-white">
          <p className="font-black text-[#ffd233]">Стройка.ру</p>

          <h1 className="mt-3 text-4xl font-black">Сообщения</h1>

          <p className="mt-3 text-blue-50">
            Здесь хранится история переписок с заказчиками и исполнителями.
          </p>
        </div>

        <div className="mt-6 rounded-[30px] bg-white p-5 shadow-sm">
          <div className="relative">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400"
              size={21}
            />

            <input
              className="input"
              style={{ paddingLeft: "60px" }}
              placeholder="Поиск по чатам"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="mt-5 space-y-3">
            {filteredChats.length === 0 ? (
              <div className="rounded-[26px] bg-[#f5f7fb] p-8 text-center">
                <MessageCircle className="mx-auto text-[#0057ff]" size={42} />

                <h2 className="mt-4 text-2xl font-black text-gray-950">
                  Чатов пока нет
                </h2>

                <p className="mt-2 text-gray-500">
                  Открой объявление другого пользователя и нажми “Написать”.
                </p>
              </div>
            ) : (
              filteredChats.map((chat) => {
                const otherId = chat.participantIds.find(
                  (uid) => uid !== user.uid
                );

                const other = otherId ? chat.participants?.[otherId] : null;

                return (
                  <Link
                    key={chat.id}
                    href={`/messages/${chat.id}`}
                    className="flex gap-4 rounded-[26px] border border-gray-100 bg-white p-4 transition hover:border-blue-200 hover:bg-blue-50/40"
                  >
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-[#0057ff]">
                      {other?.avatarUrl ? (
                        <img
                          src={other.avatarUrl}
                          alt={other.displayName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <UserRound size={28} />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate text-lg font-black text-gray-950">
                            {other?.displayName || "Пользователь"}
                          </h2>

                          {chat.listingTitle && (
                            <p className="truncate text-sm font-bold text-[#0057ff]">
                              {chat.listingTitle}
                            </p>
                          )}
                        </div>

                        <p className="shrink-0 text-xs font-bold text-gray-400">
                          {formatTime(chat)}
                        </p>
                      </div>

                      <p className="mt-2 truncate text-gray-500">
                        {chat.lastMessageText || "Чат создан"}
                      </p>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
