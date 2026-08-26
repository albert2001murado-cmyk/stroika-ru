"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eraser,
  Save,
  Sparkles,
} from "lucide-react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type DayStatus = "free" | "busy" | "reserved" | "dayoff";

type AvailabilityDay = {
  id: string;
  date: string;
  status: DayStatus;
};

const STATUS: Record<DayStatus, { label: string; short: string; className: string; dot: string }> = {
  free: {
    label: "Свободен",
    short: "Свободно",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  busy: {
    label: "Занят",
    short: "Занято",
    className: "border-rose-200 bg-rose-50 text-rose-700",
    dot: "bg-rose-500",
  },
  reserved: {
    label: "Предварительно занят",
    short: "Бронь",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  },
  dayoff: {
    label: "Выходной",
    short: "Выходной",
    className: "border-slate-200 bg-slate-100 text-slate-600",
    dot: "bg-slate-500",
  },
};

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function dayId(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthTitle(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(date);
}

function monthCells(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: count }, (_, index) => new Date(year, month, index + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function AvailabilityPage() {
  const { user, loading } = useAuth();
  const [month, setMonth] = useState(() => new Date());
  const [days, setDays] = useState<Record<string, AvailabilityDay>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [activeStatus, setActiveStatus] = useState<DayStatus>("free");
  const [saving, setSaving] = useState(false);
  const [monthAnimation, setMonthAnimation] = useState(0);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "availability", user.uid, "days"), (snapshot) => {
      const next: Record<string, AvailabilityDay> = {};
      snapshot.docs.forEach((item) => {
        const data = item.data() as Partial<AvailabilityDay>;
        const status = data.status;
        if (status === "free" || status === "busy" || status === "reserved" || status === "dayoff") {
          next[item.id] = { id: item.id, date: data.date || item.id, status };
        }
      });
      setDays(next);
    });
  }, [user]);

  const cells = useMemo(() => monthCells(month), [month]);
  const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-`;
  const stats = useMemo(() => {
    const result: Record<DayStatus, number> = { free: 0, busy: 0, reserved: 0, dayoff: 0 };
    Object.values(days).forEach((item) => {
      if (item.date.startsWith(prefix)) result[item.status] += 1;
    });
    return result;
  }, [days, prefix]);

  function changeMonth(offset: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
    setSelected([]);
    setMonthAnimation((value) => value + 1);
  }

  function toggleDate(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  async function applyStatus() {
    if (!user || selected.length === 0 || saving) return;
    setSaving(true);
    try {
      await setDoc(
        doc(db, "availability", user.uid),
        { userId: user.uid, updatedAt: serverTimestamp() },
        { merge: true }
      );
      const batch = writeBatch(db);
      selected.forEach((id) => {
        batch.set(
          doc(db, "availability", user.uid, "days", id),
          { userId: user.uid, date: id, status: activeStatus, updatedAt: serverTimestamp() },
          { merge: true }
        );
      });
      await batch.commit();
      setSelected([]);
    } finally {
      setSaving(false);
    }
  }

  async function clearSelected() {
    if (!user || selected.length === 0 || saving) return;
    setSaving(true);
    try {
      await Promise.all(
        selected.map((id) => deleteDoc(doc(db, "availability", user.uid, "days", id)))
      );
      setSelected([]);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="app-page">Загрузка...</main>;

  if (!user) {
    return (
      <main className="app-page">
        <div className="empty-card mx-auto max-w-xl">
          <CalendarDays className="mx-auto text-[#0057ff]" size={42} />
          <h1 className="mt-4">Сначала войди в аккаунт</h1>
          <p>После входа можно будет управлять своим расписанием.</p>
          <Link href="/auth" className="btn-primary mt-5">Войти</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-3 py-6 sm:px-5 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <section className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-[#0048dc] via-[#0057ff] to-[#3182ff] p-5 text-white shadow-xl shadow-blue-900/15 sm:rounded-[38px] sm:p-9">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -bottom-28 left-1/4 h-64 w-64 rounded-full bg-cyan-300/10" />
          <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/13 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] ring-1 ring-white/20">
                <Sparkles size={15} /> Профиль исполнителя
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-[-0.04em] sm:text-5xl">Календарь занятости</h1>
              <p className="mt-3 max-w-2xl font-semibold text-blue-100">
                Выбери несколько дат, назначь статус и сохрани. Изменения сразу появятся на сайте и в приложении.
              </p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(STATUS) as DayStatus[]).map((status) => (
                <div key={status} className="min-w-[72px] rounded-2xl bg-white/13 px-3 py-3 text-center ring-1 ring-white/15 backdrop-blur-md">
                  <div className="text-xl font-black">{stats[status]}</div>
                  <div className="mt-1 text-[10px] font-black text-blue-100">{STATUS[status].short}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
          <section className="overflow-hidden rounded-[30px] bg-white p-4 shadow-sm ring-1 ring-slate-200/70 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => changeMonth(-1)} className="calendar-nav-button"><ChevronLeft /></button>
              <button type="button" onClick={() => { setMonth(new Date()); setSelected([]); setMonthAnimation((v) => v + 1); }} className="text-center">
                <h2 className="capitalize text-2xl font-black text-slate-950 sm:text-3xl">{monthTitle(month)}</h2>
                <p className="mt-1 text-xs font-bold text-slate-400">Нажми, чтобы вернуться к текущему месяцу</p>
              </button>
              <button type="button" onClick={() => changeMonth(1)} className="calendar-nav-button"><ChevronRight /></button>
            </div>

            <div className="mt-6 grid grid-cols-7 gap-1 text-center text-[11px] font-black uppercase text-slate-400 sm:gap-2 sm:text-xs">
              {WEEKDAYS.map((item) => <div key={item} className="py-2">{item}</div>)}
            </div>

            <div key={monthAnimation} className="calendar-month-enter grid grid-cols-7 gap-1 sm:gap-2">
              {cells.map((date, index) => {
                if (!date) return <div key={`empty-${index}`} className="aspect-square" />;
                const id = dayId(date);
                const item = days[id];
                const chosen = selected.includes(id);
                const isToday = id === dayId(new Date());
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleDate(id)}
                    className={`calendar-day-enter relative aspect-square rounded-xl border text-sm font-black transition duration-300 sm:rounded-2xl sm:text-base ${
                      chosen
                        ? "z-10 scale-[0.94] border-[#0057ff] bg-[#0057ff] text-white shadow-lg shadow-blue-500/25"
                        : item
                        ? STATUS[item.status].className
                        : "border-slate-100 bg-slate-50 text-slate-700 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50"
                    } ${isToday && !chosen ? "ring-2 ring-[#0057ff] ring-offset-2" : ""}`}
                    style={{ animationDelay: `${Math.min(index * 12, 250)}ms` }}
                  >
                    {date.getDate()}
                    {item && !chosen ? <span className={`absolute bottom-1.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${STATUS[item.status].dot} sm:bottom-2`} /> : null}
                    {chosen ? <Check className="absolute right-1.5 top-1.5" size={13} strokeWidth={3} /> : null}
                  </button>
                );
              })}
            </div>

            <p className="mt-5 text-center text-sm font-black text-[#0057ff]">
              {selected.length ? `Выбрано дат: ${selected.length}` : "Можно выбрать сразу несколько дней"}
            </p>
          </section>

          <aside className="space-y-5">
            <section className="rounded-[30px] bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#0057ff]"><Clock3 size={21} /></span>
                <div><h2 className="text-xl font-black text-slate-950">Статус выбранных дат</h2><p className="text-xs font-bold text-slate-400">Сначала выбери дни в календаре</p></div>
              </div>
              <div className="mt-5 grid gap-2">
                {(Object.keys(STATUS) as DayStatus[]).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setActiveStatus(status)}
                    className={`flex min-h-13 items-center justify-between rounded-2xl border px-4 py-3 text-left font-black transition duration-300 hover:-translate-y-0.5 ${
                      activeStatus === status ? `${STATUS[status].className} shadow-sm` : "border-slate-100 bg-slate-50 text-slate-600"
                    }`}
                  >
                    <span className="flex items-center gap-3"><span className={`h-3 w-3 rounded-full ${STATUS[status].dot}`} />{STATUS[status].label}</span>
                    {activeStatus === status ? <Check size={18} strokeWidth={3} /> : null}
                  </button>
                ))}
              </div>
              <button type="button" disabled={!selected.length || saving} onClick={applyStatus} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#0057ff] px-5 font-black text-white shadow-lg shadow-blue-500/20 transition hover:-translate-y-0.5 disabled:cursor-default disabled:opacity-45">
                <Save size={19} /> {saving ? "Сохраняем..." : "Сохранить даты"}
              </button>
              <button type="button" disabled={!selected.length || saving} onClick={clearSelected} className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-red-50 px-5 text-sm font-black text-red-600 transition hover:bg-red-100 disabled:cursor-default disabled:opacity-40">
                <Eraser size={18} /> Очистить выбранные
              </button>
            </section>

            <section className="rounded-[26px] bg-blue-50 p-5 ring-1 ring-blue-100">
              <div className="flex items-start gap-3 text-[#0057ff]"><CalendarDays className="mt-0.5 shrink-0" size={21} /><p className="text-sm font-bold leading-6">Календарь публичный: заказчики увидят свободные, занятые, предварительно занятые и выходные дни.</p></div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
