"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import {
  Bell,
  BellRing,
  CheckCheck,
  ChevronRight,
  ClipboardCheck,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type NotificationType = "message" | "moderation" | "request" | "calendar" | "portfolio" | "system" | string;

type AppNotification = {
  id: string;
  type?: NotificationType;
  title?: string;
  body?: string;
  url?: string;
  read?: boolean;
  createdAt?: any;
  actorName?: string;
};

function millis(value: any) {
  return value?.toMillis?.() || value?.seconds * 1000 || 0;
}

function formatTime(value: any) {
  const ms = millis(value);
  if (!ms) return "только что";
  const date = new Date(ms);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat("ru-RU", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
  ).format(date);
}

function meta(type?: NotificationType) {
  switch (type) {
    case "message":
      return { Icon: MessageCircle, iconClass: "bg-blue-50 text-[#0057ff]", stripe: "bg-[#0057ff]" };
    case "moderation":
      return { Icon: ShieldCheck, iconClass: "bg-violet-50 text-violet-600", stripe: "bg-violet-500" };
    case "request":
      return { Icon: ClipboardCheck, iconClass: "bg-amber-50 text-amber-600", stripe: "bg-amber-500" };
    case "calendar":
      return { Icon: BellRing, iconClass: "bg-emerald-50 text-emerald-600", stripe: "bg-emerald-500" };
    case "portfolio":
      return { Icon: Sparkles, iconClass: "bg-cyan-50 text-cyan-600", stripe: "bg-cyan-500" };
    default:
      return { Icon: Bell, iconClass: "bg-slate-100 text-slate-600", stripe: "bg-slate-400" };
  }
}

export default function NotificationsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }

    const notificationsQuery = query(
      collection(db, "users", user.uid, "notifications"),
      orderBy("createdAt", "desc"),
      limit(100)
    );

    return onSnapshot(
      notificationsQuery,
      (snapshot) => {
        setItems(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as AppNotification[]);
      },
      (error) => console.error("notifications snapshot error:", error)
    );
  }, [user]);

  const unread = items.filter((item) => !item.read).length;
  const shown = useMemo(
    () => (filter === "unread" ? items.filter((item) => !item.read) : items),
    [filter, items]
  );

  async function markRead(item: AppNotification) {
    if (!user || item.read) return;
    await updateDoc(doc(db, "users", user.uid, "notifications", item.id), {
      read: true,
      readAt: serverTimestamp(),
    });
  }

  async function openNotification(item: AppNotification) {
    await markRead(item);
    if (item.url) router.push(item.url);
  }

  async function markAllRead() {
    if (!user || unread === 0 || working) return;
    setWorking(true);
    try {
      const batch = writeBatch(db);
      items.filter((item) => !item.read).forEach((item) => {
        batch.update(doc(db, "users", user.uid, "notifications", item.id), {
          read: true,
          readAt: serverTimestamp(),
        });
      });
      await batch.commit();
    } finally {
      setWorking(false);
    }
  }

  async function remove(item: AppNotification) {
    if (!user) return;
    await deleteDoc(doc(db, "users", user.uid, "notifications", item.id));
  }

  if (loading) {
    return <main className="app-page"><div className="app-container">Загрузка...</div></main>;
  }

  if (!user) {
    return (
      <main className="app-page">
        <div className="empty-card mx-auto max-w-xl">
          <Bell className="mx-auto text-[#0057ff]" size={42} />
          <h1 className="mt-4">Сначала войди в аккаунт</h1>
          <p>Центр уведомлений доступен авторизованным пользователям.</p>
          <Link href="/auth" className="btn-primary mt-5">Войти</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-3 py-6 sm:px-5 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <section className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-[#0048dc] via-[#0057ff] to-[#3182ff] p-5 text-white shadow-xl shadow-blue-900/15 sm:rounded-[38px] sm:p-9">
          <div className="pointer-events-none absolute -right-16 -top-20 h-60 w-60 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -bottom-24 left-1/4 h-56 w-56 rounded-full bg-cyan-300/10" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/13 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] ring-1 ring-white/20">
                <BellRing size={15} /> Всё важное в одном месте
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-[-0.04em] sm:text-5xl">Уведомления</h1>
              <p className="mt-3 max-w-2xl font-semibold text-blue-100">
                Сообщения, модерация, заявки и системные события синхронизируются с приложением.
              </p>
            </div>
            <div className="rounded-[24px] bg-white/13 px-5 py-4 text-center ring-1 ring-white/20 backdrop-blur-md">
              <div className="text-3xl font-black">{unread}</div>
              <div className="text-xs font-black uppercase tracking-[0.12em] text-blue-100">непрочитанных</div>
            </div>
          </div>
        </section>

        <div className="mt-5 flex flex-col gap-3 rounded-[26px] bg-white p-3 shadow-sm ring-1 ring-slate-200/70 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1.5 sm:inline-grid">
            <button type="button" onClick={() => setFilter("all")} className={`rounded-xl px-5 py-3 text-sm font-black transition ${filter === "all" ? "bg-white text-[#0057ff] shadow-sm" : "text-slate-500"}`}>
              Все ({items.length})
            </button>
            <button type="button" onClick={() => setFilter("unread")} className={`rounded-xl px-5 py-3 text-sm font-black transition ${filter === "unread" ? "bg-white text-[#0057ff] shadow-sm" : "text-slate-500"}`}>
              Новые ({unread})
            </button>
          </div>
          <button type="button" onClick={markAllRead} disabled={unread === 0 || working} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-blue-50 px-5 text-sm font-black text-[#0057ff] transition hover:-translate-y-0.5 disabled:cursor-default disabled:opacity-45">
            <CheckCheck size={19} /> {working ? "Сохраняем..." : "Прочитать всё"}
          </button>
        </div>

        {shown.length === 0 ? (
          <div className="mt-5 rounded-[30px] bg-white px-6 py-14 text-center shadow-sm ring-1 ring-dashed ring-blue-200">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-blue-50 text-[#0057ff]"><Bell size={30} /></div>
            <h2 className="mt-5 text-2xl font-black text-slate-950">Здесь пока тихо</h2>
            <p className="mt-2 text-slate-500">Новые события появятся здесь автоматически.</p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {shown.map((item, index) => {
              const { Icon, iconClass, stripe } = meta(item.type);
              return (
                <article
                  key={item.id}
                  className={`notification-card-enter group relative overflow-hidden rounded-[26px] bg-white p-4 shadow-sm ring-1 transition duration-300 hover:-translate-y-1 hover:shadow-xl sm:p-5 ${item.read ? "ring-slate-200/70" : "ring-blue-200"}`}
                  style={{ animationDelay: `${Math.min(index * 45, 360)}ms` }}
                >
                  <div className={`absolute inset-y-0 left-0 w-1.5 ${item.read ? "bg-slate-200" : stripe}`} />
                  <div className="flex items-start gap-3 sm:gap-4">
                    <button type="button" onClick={() => openNotification(item)} className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition duration-300 group-hover:scale-105 ${iconClass}`}>
                      <Icon size={22} strokeWidth={2.7} />
                    </button>
                    <button type="button" onClick={() => openNotification(item)} className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-black text-slate-950 sm:text-lg">{item.title || "Стройка.ру"}</h2>
                        {!item.read ? <span className="rounded-full bg-[#0057ff] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-white">Новое</span> : null}
                      </div>
                      <p className="mt-1.5 text-sm font-medium leading-6 text-slate-500">{item.body || "Новое событие"}</p>
                      <p className="mt-2 text-xs font-black text-slate-400">{formatTime(item.createdAt)}</p>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      {item.url ? (
                        <button type="button" onClick={() => openNotification(item)} aria-label="Открыть" className="flex h-10 w-10 items-center justify-center rounded-2xl text-[#0057ff] transition hover:bg-blue-50 active:scale-90">
                          <ChevronRight size={21} />
                        </button>
                      ) : null}
                      <button type="button" onClick={() => remove(item)} aria-label="Удалить" className="flex h-10 w-10 items-center justify-center rounded-2xl text-slate-300 transition hover:bg-red-50 hover:text-red-500 active:scale-90">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
