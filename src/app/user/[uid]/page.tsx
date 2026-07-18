"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import type { Listing, UserProfile } from "@/types";
import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  GitCompareArrows,
  Mail,
  MapPin,
  Phone,
  UserRound,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type PortfolioItem = {
  id: string;
  title: string;
  description?: string;
  city?: string;
  imageUrls?: string[];
  createdAt?: any;
};

type AvailabilityDay = {
  id: string;
  date: string;
  status: "free" | "busy";
};

function accountText(profile?: UserProfile | null) {
  if (profile?.accountType === "ip") return "ИП";
  if (profile?.accountType === "ooo") return "ООО";
  return "Физлицо";
}

export default function PublicUserPage() {
  const params = useParams();
  const uid = String(params.uid);
  const { user } = useAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [availability, setAvailability] = useState<AvailabilityDay[]>([]);
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDoc(doc(db, "users", uid)).then((snap) => {
      if (snap.exists()) setProfile({ uid: snap.id, ...snap.data() } as UserProfile);
      setLoading(false);
    });

    const unsubListings = onSnapshot(query(collection(db, "listings"), where("authorId", "==", uid)), (snapshot) => {
      const data = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as Listing[];
      data.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setListings(data);
    });

    const unsubPortfolio = onSnapshot(query(collection(db, "portfolio"), where("userId", "==", uid)), (snapshot) => {
      const data = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as PortfolioItem[];
      data.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setPortfolio(data);
    });

    const unsubDays = onSnapshot(collection(db, "availability", uid, "days"), (snapshot) => {
      setAvailability(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as AvailabilityDay[]);
    });

    return () => {
      unsubListings();
      unsubPortfolio();
      unsubDays();
    };
  }, [uid]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "comparisonSelections", user.uid), (snapshot) => {
      setComparisonIds((snapshot.data()?.userIds || []).slice(0, 3));
    });
  }, [user]);

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return availability
      .filter((item) => item.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 14);
  }, [availability]);

  async function toggleCompare() {
    if (!user || user.uid === uid) return;
    const exists = comparisonIds.includes(uid);
    const next = exists
      ? comparisonIds.filter((item) => item !== uid)
      : [...comparisonIds, uid].slice(0, 3);

    await setDoc(
      doc(db, "comparisonSelections", user.uid),
      { userIds: next, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  if (loading) return <main className="app-page">Загрузка...</main>;

  return (
    <main className="app-page">
      <div className="app-container max-w-6xl">
        <section className="overflow-hidden rounded-[34px] bg-white shadow-sm">
          <div className="h-28 bg-[#0057ff] sm:h-36" />
          <div className="-mt-14 px-4 pb-6 sm:-mt-16 sm:px-8 sm:pb-8">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end">
              <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-[#0057ff] ring-8 ring-white sm:h-32 sm:w-32">
                {profile?.avatarUrl ? <img src={profile.avatarUrl} alt={profile.displayName} className="h-full w-full object-cover" /> : <UserRound size={48} />}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <h1 className="break-words text-3xl font-black text-gray-950 sm:text-4xl">{profile?.displayName || "Пользователь"}</h1>
                <p className="mt-2 flex items-center gap-2 font-bold text-gray-500"><BriefcaseBusiness size={18} />{accountText(profile)}</p>
              </div>

              {user && user.uid !== uid && (
                <button type="button" onClick={toggleCompare} className={comparisonIds.includes(uid) ? "btn-yellow" : "btn-primary"}>
                  <GitCompareArrows size={19} />
                  {comparisonIds.includes(uid) ? "Убрать из сравнения" : "Сравнить"}
                </button>
              )}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {profile?.companyName && <div className="info-card"><Building2 size={18} />{profile.companyName}</div>}
              {profile?.city && <div className="info-card"><MapPin size={18} />{profile.city}</div>}
              {profile?.phone && <div className="info-card"><Phone size={18} />{profile.phone}</div>}
              {profile?.email && <div className="info-card min-w-0"><Mail className="shrink-0" size={18} /><span className="truncate">{profile.email}</span></div>}
            </div>
          </div>
        </section>

        <section className="panel mt-6">
          <div className="flex items-center gap-3">
            <CalendarDays className="text-[#0057ff]" />
            <div><h2 className="text-2xl font-black text-gray-950">Ближайшая занятость</h2><p className="text-sm text-gray-500">Данные синхронизированы с приложением</p></div>
          </div>

          {upcoming.length === 0 ? (
            <p className="mt-5 rounded-2xl bg-[#f8fafc] p-4 font-bold text-gray-500">Исполнитель пока не указал расписание.</p>
          ) : (
            <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
              {upcoming.map((item) => (
                <div key={item.id} className={`min-w-28 rounded-2xl px-4 py-3 text-center font-black ${item.status === "free" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  <p>{new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(new Date(`${item.date}T12:00:00`))}</p>
                  <p className="mt-1 text-xs">{item.status === "free" ? "Свободен" : "Занят"}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-3xl font-black text-gray-950">Портфолио</h2>
          {portfolio.length === 0 ? (
            <div className="empty-card mt-5"><h3>Работ пока нет</h3><p>Исполнитель ещё не добавил портфолио.</p></div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {portfolio.map((item) => (
                <article key={item.id} className="panel overflow-hidden p-0">
                  <div className="h-52 bg-blue-50">
                    {item.imageUrls?.[0] ? <img src={item.imageUrls[0]} alt={item.title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-3xl font-black text-blue-200">Стройка.ру</div>}
                  </div>
                  <div className="p-5">
                    <h3 className="text-xl font-black text-gray-950">{item.title}</h3>
                    {item.city && <p className="mt-2 flex items-center gap-2 text-sm font-bold text-gray-500"><MapPin size={16} />{item.city}</p>}
                    {item.description && <p className="mt-3 line-clamp-3 text-sm leading-6 text-gray-500">{item.description}</p>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-3xl font-black text-gray-950">Объявления пользователя</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {listings.length === 0 ? (
              <div className="empty-card sm:col-span-2 lg:col-span-3"><h3>Объявлений пока нет</h3></div>
            ) : (
              listings.map((listing) => (
                <Link key={listing.id} href={`/listing/${listing.id}`} className="panel overflow-hidden p-0 transition hover:-translate-y-1 hover:shadow-xl">
                  <div className="h-52 bg-blue-50">
                    {listing.imageUrls?.[0] ? <img src={listing.imageUrls[0]} alt={listing.title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-3xl font-black text-blue-200">Стройка.ру</div>}
                  </div>
                  <div className="p-5">
                    <p className="font-black text-[#0057ff]">{listing.category}</p>
                    <h3 className="mt-2 line-clamp-2 text-xl font-black text-gray-950">{listing.title}</h3>
                    <p className="mt-3 flex items-center gap-2 text-sm font-bold text-gray-500"><MapPin size={16} />{listing.city}</p>
                    <p className="mt-4 text-2xl font-black text-gray-950">{listing.priceFrom ? `от ${listing.priceFrom.toLocaleString("ru-RU")} ₽` : "Договорная"}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
