"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type DayStatus = "free" | "busy";

type AvailabilityDay = {
  id: string;
  date: string;
  status: DayStatus;
};

function dayId(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthTitle(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export default function AvailabilityPage() {
  const { user, loading } = useAuth();
  const [month, setMonth] = useState(() => new Date());
  const [days, setDays] = useState<Record<string, DayStatus>>({});

  useEffect(() => {
    if (!user) return;

    return onSnapshot(
      collection(db, "availability", user.uid, "days"),
      (snapshot) => {
        const next: Record<string, DayStatus> = {};
        snapshot.docs.forEach((item) => {
          const data = item.data() as AvailabilityDay;
          if (data.status === "free" || data.status === "busy") {
            next[item.id] = data.status;
          }
        });
        setDays(next);
      }
    );
  }, [user]);

  const calendarDays = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const first = new Date(year, monthIndex, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const count = new Date(year, monthIndex + 1, 0).getDate();

    return [
      ...Array.from({ length: startOffset }, () => null),
      ...Array.from({ length: count }, (_, index) => new Date(year, monthIndex, index + 1)),
    ];
  }, [month]);

  async function toggleDate(date: Date) {
    if (!user) return;
    const id = dayId(date);
    const current = days[id];
    const next: DayStatus = current === "free" ? "busy" : current === "busy" ? "free" : "free";

    await setDoc(
      doc(db, "availability", user.uid),
      { userId: user.uid, updatedAt: serverTimestamp() },
      { merge: true }
    );

    await setDoc(
      doc(db, "availability", user.uid, "days", id),
      {
        userId: user.uid,
        date: id,
        status: next,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  if (loading) return <main className="app-page">Загрузка...</main>;

  if (!user) {
    return (
      <main className="app-page">
        <div className="empty-card">
          <h1>Сначала войди в аккаунт</h1>
          <Link href="/auth" className="btn-primary mt-5">Войти</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="app-page">
      <div className="app-container max-w-5xl">
        <div className="page-title-row">
          <Link href="/profile" className="icon-button"><ArrowLeft size={21} /></Link>
          <div>
            <p className="page-eyebrow">Профиль исполнителя</p>
            <h1 className="page-title">Календарь занятости</h1>
          </div>
        </div>

        <section className="panel mt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-black capitalize text-gray-950">{monthTitle(month)}</h2>
              <p className="mt-1 text-sm font-medium text-gray-500">
                Нажмите на день: свободен → занят → свободен.
              </p>
            </div>

            <div className="flex gap-2">
              <button type="button" className="icon-button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                <ChevronLeft />
              </button>
              <button type="button" className="icon-button" onClick={() => setMonth(new Date())}>
                <CalendarDays size={20} />
              </button>
              <button type="button" className="icon-button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
                <ChevronRight />
              </button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-7 gap-1 text-center text-[11px] font-black uppercase text-gray-400 sm:gap-2 sm:text-xs">
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((item) => <div key={item} className="py-2">{item}</div>)}
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {calendarDays.map((date, index) => {
              if (!date) return <div key={`empty-${index}`} className="aspect-square" />;

              const id = dayId(date);
              const status = days[id];
              const isToday = id === dayId(new Date());

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleDate(date)}
                  className={[
                    "relative aspect-square rounded-xl border text-sm font-black transition sm:rounded-2xl sm:text-base",
                    status === "free"
                      ? "border-green-200 bg-green-50 text-green-700"
                      : status === "busy"
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-gray-100 bg-[#f8fafc] text-gray-700 hover:border-blue-200 hover:bg-blue-50",
                    isToday ? "ring-2 ring-[#0057ff] ring-offset-2" : "",
                  ].join(" ")}
                >
                  {date.getDate()}
                  {status && (
                    <span className="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-current sm:bottom-2" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap gap-3 text-sm font-bold">
            <span className="rounded-full bg-green-50 px-4 py-2 text-green-700">Свободен</span>
            <span className="rounded-full bg-red-50 px-4 py-2 text-red-700">Занят</span>
            <span className="rounded-full bg-gray-100 px-4 py-2 text-gray-600">Не указано</span>
          </div>
        </section>
      </div>
    </main>
  );
}
