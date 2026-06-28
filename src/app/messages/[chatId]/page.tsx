"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import type { Chat, Message } from "@/types";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { ArrowLeft, Send } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const chatId = params.chatId as string;

  const { user, profile, loading } = useAuth();

  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!chatId) return;

    const unsub = onSnapshot(doc(db, "chats", chatId), (snapshot) => {
      if (snapshot.exists()) {
        setChat({
          id: snapshot.id,
          ...snapshot.data(),
        } as Chat);
      }
    });

    return () => unsub();
  }, [chatId]);

  useEffect(() => {
    if (!chatId) return;

    const unsub = onSnapshot(
      collection(db, "chats", chatId, "messages"),
      (snapshot) => {
        const data = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        })) as Message[];

        data.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return aTime - bTime;
        });

        setMessages(data);
      }
    );

    return () => unsub();
  }, [chatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();

    if (!user) {
      router.push("/auth");
      return;
    }

    if (!chat || !text.trim()) return;

    const messageText = text.trim();
    setText("");

    await addDoc(collection(db, "chats", chatId, "messages"), {
      chatId,
      senderId: user.uid,
      senderName: profile?.displayName || user.displayName || user.email,
      text: messageText,
      createdAt: serverTimestamp(),
    });

    await setDoc(
      doc(db, "chats", chatId),
      {
        lastMessage: messageText,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

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

  const otherName =
    chat?.ownerId === user.uid ? chat?.clientName : chat?.ownerName;

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-5 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-150px)] max-w-4xl flex-col rounded-[34px] bg-white shadow-sm">
        <div className="border-b border-gray-100 p-5">
          <Link
            href="/messages"
            className="inline-flex items-center gap-2 font-black text-[#0057ff]"
          >
            <ArrowLeft size={18} />
            Все сообщения
          </Link>

          <h1 className="mt-4 text-3xl font-black text-gray-950">
            {otherName || "Переписка"}
          </h1>

          {chat && (
            <Link
              href={`/listing/${chat.listingId}`}
              className="mt-1 block font-bold text-[#0057ff]"
            >
              {chat.listingTitle}
            </Link>
          )}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {messages.length === 0 ? (
            <div className="rounded-3xl bg-blue-50 p-6 text-center text-gray-500">
              Сообщений пока нет. Напишите первым.
            </div>
          ) : (
            messages.map((message) => {
              const isMine = message.senderId === user.uid;

              return (
                <div
                  key={message.id}
                  className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-3xl px-5 py-3 ${
                      isMine
                        ? "bg-[#0057ff] text-white"
                        : "bg-gray-100 text-gray-950"
                    }`}
                  >
                    <p className="text-xs font-bold opacity-70">
                      {message.senderName}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap font-medium">
                      {message.text}
                    </p>
                  </div>
                </div>
              );
            })
          )}

          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSend} className="border-t border-gray-100 p-4">
          <div className="flex gap-3">
            <input
              className="input"
              placeholder="Написать сообщение..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />

            <button
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#0057ff] text-white"
              title="Отправить"
            >
              <Send size={21} />
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
