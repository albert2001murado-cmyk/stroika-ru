"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import type { UserProfile } from "@/types";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { ArrowLeft, BriefcaseBusiness, CalendarDays, GitCompareArrows, MapPin, Star, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type ComparisonSelection = { userIds?: string[] };
type PortfolioItem = { id: string; userId: string };
type Review = { id: string; authorId?: string; listingId?: string; rating?: number };

type ComparedUser = UserProfile & {
  portfolioCount: number;
  listingCount: number;
  freeDays: number;
};

export default function ComparePage() {
  const { user, loading } = useAuth();
  const [ids, setIds] = useState<string[]>([]);
  const [users, setUsers] = useState<ComparedUser[]>([]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "comparisonSelections", user.uid), (snapshot) => {
      const data = snapshot.data() as ComparisonSelection | undefined;
      setIds((data?.userIds || []).slice(0, 3));
    });
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result: ComparedUser[] = [];

      for (const uid of ids) {
        const userSnap = await getDoc(doc(db, "users", uid));
        if (!userSnap.exists()) continue;

        const [listingSnap, portfolioSnap, daysSnap] = await Promise.all([
          new Promise<any>((resolve) => {
            const unsub = onSnapshot(query(collection(db, "listings"), where("authorId", "==", uid)), (snap) => { unsub(); resolve(snap); });
          }),
          new Promise<any>((resolve) => {
            const unsub = onSnapshot(query(collection(db, "portfolio"), where("userId", "==", uid)), (snap) => { unsub(); resolve(snap); });
          }),
          new Promise<any>((resolve) => {
            const unsub = onSnapshot(collection(db, "availability", uid, "days"), (snap) => { unsub(); resolve(snap); });
          }),
        ]);

        result.push({
          uid: userSnap.id,
          ...userSnap.data(),
          listingCount: listingSnap.size,
          portfolioCount: portfolioSnap.size,
          freeDays: daysSnap.docs.filter((item: any) => item.data().status === "free").length,
        } as ComparedUser);
      }

      if (!cancelled) setUsers(result);
    }

    load();
    return () => { cancelled = true; };
  }, [ids]);

  async function remove(uid: string) {
    if (!user) return;
    const { setDoc, serverTimestamp } = await import("firebase/firestore");
    await setDoc(
      doc(db, "comparisonSelections", user.uid),
      { userIds: ids.filter((item) => item !== uid), updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  if (loading) return <main className="app-page">Загрузка...</main>;

  if (!user) {
    return <main className="app-page"><div className="empty-card"><h1>Сначала войди в аккаунт</h1><Link href="/auth" className="btn-primary mt-5">Войти</Link></div></main>;
  }

  return (
    <main className="app-page">
      <div className="app-container">
        <div className="page-title-row">
          <Link href="/profile" className="icon-button"><ArrowLeft size={21} /></Link>
          <div><p className="page-eyebrow">Исполнители</p><h1 className="page-title">Сравнение анкет</h1></div>
        </div>

        {users.length === 0 ? (
          <div className="empty-card mt-6">
            <GitCompareArrows className="mx-auto text-[#0057ff]" size={42} />
            <h3 className="mt-4">Список сравнения пуст</h3>
            <p>Откройте профиль исполнителя и добавьте его в сравнение.</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {users.map((item) => (
              <article key={item.uid} className="panel relative">
                <button type="button" onClick={() => remove(item.uid)} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500"><X size={17} /></button>
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-[#0057ff]">
                  {item.avatarUrl ? <img src={item.avatarUrl} alt={item.displayName} className="h-full w-full object-cover" /> : <UserRound size={32} />}
                </div>
                <h2 className="mt-4 text-2xl font-black text-gray-950">{item.displayName || "Пользователь"}</h2>
                {item.city && <p className="mt-2 flex items-center gap-2 font-bold text-gray-500"><MapPin size={17} />{item.city}</p>}

                <div className="mt-5 grid grid-cols-3 gap-2">
                  <div className="rounded-2xl bg-[#f8fafc] p-3 text-center"><BriefcaseBusiness className="mx-auto text-[#0057ff]" size={18} /><p className="mt-2 text-xl font-black">{item.portfolioCount}</p><p className="text-[11px] font-bold text-gray-500">Работ</p></div>
                  <div className="rounded-2xl bg-[#f8fafc] p-3 text-center"><Star className="mx-auto text-[#0057ff]" size={18} /><p className="mt-2 text-xl font-black">{item.listingCount}</p><p className="text-[11px] font-bold text-gray-500">Анкет</p></div>
                  <div className="rounded-2xl bg-[#f8fafc] p-3 text-center"><CalendarDays className="mx-auto text-[#0057ff]" size={18} /><p className="mt-2 text-xl font-black">{item.freeDays}</p><p className="text-[11px] font-bold text-gray-500">Свободно</p></div>
                </div>

                <Link href={`/user/${item.uid}`} className="btn-primary mt-5 w-full">Открыть профиль</Link>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
