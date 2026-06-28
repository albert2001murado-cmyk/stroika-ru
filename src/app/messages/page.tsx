"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import type { Chat } from "@/types";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function MessagesPage() {
  const { user, loading } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);

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

      data.sort((a, b) => {
        const aTime = a.updatedAt?.toMillis?.() || 0;
        const bTime = b.updatedAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

      setChats(data);
    });

    return () => unsub();
  }, [user]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-5 py-10">
        Загрузка...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-5 py-10">
        <div className="mx-auto max-w-xl rounded-[30px] bg-white p-8 text-center shadow-xl">
          <h1 className="text-3xl font-black text-gray-950">
            Сначала войди в аккаунт
          </h1>
          <Link href="/auth" className="btn-primary mt-6 inline-block">
            Войти
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-5 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-[34px] bg-[#0057ff] p-8 text-white shadow-xl shadow-blue-900/15">
          <p className="font-black text-[#ffd233]">Стройка.ру</p>
          <h1 className="mt-3 text-4xl font-black">Сообщения</h1>
          <p className="mt-3 text-blue-50">
            Здесь будут переписки по объявлениям.
          </p>
        </div>

        <section className="mt-6 rounded-[30px] bg-white p-6 shadow-sm">
          {chats.length === 0 ? (
            <div className="rounded-[26px] border border-dashed border-blue-200 bg-blue-50/50 p-10 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-[#0057ff]">
                <MessageCircle size={30} />
              </div>

              <h2 className="mt-5 text-2xl font-black text-gray-950">
                Сообщений пока нет
              </h2>

              <p className="mt-2 text-gray-500">
                Переписка появится, когда кто-то напишет по объявлению.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {chats.map((chat) => {
                const otherName =
                  chat.ownerId === user.uid ? chat.clientName : chat.ownerName;

                return (
                  <Link
                    key={chat.id}
                    href={`/messages/${chat.id}`}
                    className="block rounded-3xl border border-gray-100 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-900/10"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xl font-black text-gray-950">
                          {otherName}
                        </p>

                        <p className="mt-1 font-bold text-[#0057ff]">
                          {chat.listingTitle}
                        </p>

                        <p className="mt-3 text-gray-500">
                          {chat.lastMessage || "Открыть переписку"}
                        </p>
                      </div>

                      <MessageCircle className="text-[#0057ff]" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
