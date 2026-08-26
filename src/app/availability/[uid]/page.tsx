"use client";

import { db } from "@/lib/firebase";
import { CalendarDays, ChevronLeft, ChevronRight, UserRound } from "lucide-react";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type DayStatus = "free" | "busy" | "reserved" | "dayoff";
type Day = { id: string; date: string; status: DayStatus };

const STATUS: Record<DayStatus, { label: string; className: string; dot: string }> = {
  free: { label: "Свободен", className: "border-emerald-200 bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  busy: { label: "Занят", className: "border-rose-200 bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  reserved: { label: "Предварительно", className: "border-amber-200 bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  dayoff: { label: "Выходной", className: "border-slate-200 bg-slate-100 text-slate-600", dot: "bg-slate-500" },
};
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
function id(date: Date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }
function cells(date: Date) { const y=date.getFullYear(),m=date.getMonth(),o=(new Date(y,m,1).getDay()+6)%7,c=new Date(y,m+1,0).getDate(); const a:Array<Date|null>=[...Array.from({length:o},()=>null),...Array.from({length:c},(_,i)=>new Date(y,m,i+1))]; while(a.length%7)a.push(null); return a; }

export default function PublicAvailabilityPage() {
  const uid = String(useParams()?.uid || "");
  const [month, setMonth] = useState(new Date());
  const [days, setDays] = useState<Record<string, Day>>({});
  const [profile, setProfile] = useState<any>(null);
  const [animation, setAnimation] = useState(0);

  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, "users", uid)).then((snap) => setProfile(snap.exists() ? snap.data() : null));
    return onSnapshot(collection(db, "availability", uid, "days"), (snap) => {
      const next: Record<string, Day> = {};
      snap.docs.forEach((item) => { const data=item.data() as any; if (STATUS[data.status as DayStatus]) next[item.id]={id:item.id,date:data.date||item.id,status:data.status}; });
      setDays(next);
    });
  }, [uid]);

  const monthCells = useMemo(() => cells(month), [month]);
  const name = profile?.displayName || profile?.name || "Исполнитель";
  const avatar = profile?.avatarUrl || profile?.photoURL || "";
  function change(offset:number){ setMonth((d)=>new Date(d.getFullYear(),d.getMonth()+offset,1)); setAnimation(v=>v+1); }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-3 py-6 sm:px-5 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#0048dc] via-[#0057ff] to-[#3182ff] p-6 text-white shadow-xl sm:p-9">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10" />
          <div className="relative flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[22px] bg-white text-[#0057ff] shadow-lg">
              {avatar ? <img src={avatar} alt={name} className="h-full w-full object-cover" /> : <UserRound size={30} />}
            </div>
            <div className="min-w-0"><p className="truncate text-xl font-black">{name}</p><p className="mt-1 font-bold text-blue-100">Публичное расписание исполнителя</p></div>
          </div>
          <h1 className="relative mt-7 text-3xl font-black tracking-[-0.04em] sm:text-5xl">Календарь занятости</h1>
          <p className="relative mt-3 max-w-2xl font-semibold text-blue-100">Выберите удобную дату перед тем, как написать исполнителю.</p>
        </section>

        <section className="mt-5 rounded-[30px] bg-white p-4 shadow-sm ring-1 ring-slate-200/70 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <button onClick={()=>change(-1)} className="calendar-nav-button"><ChevronLeft /></button>
            <div className="text-center"><h2 className="capitalize text-2xl font-black text-slate-950 sm:text-3xl">{new Intl.DateTimeFormat("ru-RU",{month:"long",year:"numeric"}).format(month)}</h2><p className="mt-1 text-xs font-bold text-slate-400">Данные обновляются автоматически</p></div>
            <button onClick={()=>change(1)} className="calendar-nav-button"><ChevronRight /></button>
          </div>
          <div className="mt-6 grid grid-cols-7 gap-1 text-center text-[11px] font-black uppercase text-slate-400 sm:gap-2 sm:text-xs">{WEEKDAYS.map(d=><div key={d} className="py-2">{d}</div>)}</div>
          <div key={animation} className="calendar-month-enter grid grid-cols-7 gap-1 sm:gap-2">
            {monthCells.map((date,index)=>{
              if(!date) return <div key={`e-${index}`} className="aspect-square"/>;
              const key=id(date),item=days[key],today=key===id(new Date());
              return <div key={key} className={`calendar-day-enter relative flex aspect-square items-center justify-center rounded-xl border text-sm font-black sm:rounded-2xl sm:text-base ${item?STATUS[item.status].className:"border-slate-100 bg-slate-50 text-slate-500"} ${today?"ring-2 ring-[#0057ff] ring-offset-2":""}`} style={{animationDelay:`${Math.min(index*12,250)}ms`}}>{date.getDate()}{item?<span className={`absolute bottom-1.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${STATUS[item.status].dot} sm:bottom-2`}/>:null}</div>
            })}
          </div>
          <div className="mt-6 grid gap-2 sm:grid-cols-4">{(Object.keys(STATUS) as DayStatus[]).map(status=><div key={status} className={`flex items-center gap-2 rounded-2xl border px-3 py-3 text-sm font-black ${STATUS[status].className}`}><span className={`h-2.5 w-2.5 rounded-full ${STATUS[status].dot}`}/>{STATUS[status].label}</div>)}</div>
        </section>
      </div>
    </main>
  );
}
