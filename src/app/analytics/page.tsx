"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import type { Listing } from "@/types";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { ArrowLeft, BarChart3, Eye, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type AnalyticsEvent = {
  id: string;
  listingId: string;
  type: "view" | "phone" | "chat";
};

export default function AnalyticsPage() {
  const { user, loading } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [eventsByListing, setEventsByListing] = useState<Record<string, AnalyticsEvent[]>>({});

  useEffect(() => {
    if (!user) return;

    return onSnapshot(
      query(collection(db, "listings"), where("authorId", "==", user.uid)),
      (snapshot) => {
        setListings(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as Listing[]
        );
      }
    );
  }, [user]);

  useEffect(() => {
    const unsubscribers = listings.map((listing) =>
      onSnapshot(
        collection(db, "listingAnalytics", listing.id, "events"),
        (snapshot) => {
          setEventsByListing((current) => ({
            ...current,
            [listing.id]: snapshot.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            })) as AnalyticsEvent[],
          }));
        }
      )
    );

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [listings]);

  const totals = useMemo(() => {
    const all = Object.values(eventsByListing).flat();
    return {
      view: all.filter((item) => item.type === "view").length,
      phone: all.filter((item) => item.type === "phone").length,
      chat: all.filter((item) => item.type === "chat").length,
    };
  }, [eventsByListing]);

  if (loading) return <main className="app-page">Загрузка...</main>;

  if (!user) {
    return (
      <main className="app-page">
        <div className="empty-card"><h1>Сначала войди в аккаунт</h1><Link href="/auth" className="btn-primary mt-5">Войти</Link></div>
      </main>
    );
  }

  const statCards = [
    { label: "Просмотры", value: totals.view, Icon: Eye },
    { label: "Нажатия на телефон", value: totals.phone, Icon: Phone },
    { label: "Переходы в чат", value: totals.chat, Icon: MessageCircle },
  ];

  return (
    <main className="app-page">
      <div className="app-container">
        <div className="page-title-row">
          <Link href="/profile" className="icon-button"><ArrowLeft size={21} /></Link>
          <div><p className="page-eyebrow">Объявления</p><h1 className="page-title">Статистика</h1></div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {statCards.map(({ label, value, Icon }) => (
            <div key={label} className="panel">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0057ff]"><Icon /></span>
              <p className="mt-5 text-4xl font-black text-gray-950">{value}</p>
              <p className="mt-1 font-bold text-gray-500">{label}</p>
            </div>
          ))}
        </div>

        <section className="panel mt-6">
          <div className="flex items-center gap-3">
            <BarChart3 className="text-[#0057ff]" />
            <h2 className="text-2xl font-black text-gray-950">По объявлениям</h2>
          </div>

          {listings.length === 0 ? (
            <div className="empty-card mt-5"><h3>Нет объявлений</h3><p>После публикации здесь появится статистика.</p></div>
          ) : (
            <div className="mt-5 space-y-3">
              {listings.map((listing) => {
                const events = eventsByListing[listing.id] || [];
                const views = events.filter((item) => item.type === "view").length;
                const phones = events.filter((item) => item.type === "phone").length;
                const chats = events.filter((item) => item.type === "chat").length;

                return (
                  <Link key={listing.id} href={`/listing/${listing.id}`} className="block rounded-[24px] border border-gray-100 p-4 transition hover:border-blue-200 hover:bg-blue-50/40">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="truncate font-black text-gray-950">{listing.title}</h3>
                        <p className="mt-1 text-sm font-bold text-[#0057ff]">{listing.category}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <span className="rounded-2xl bg-gray-100 px-3 py-2 text-sm font-black"><Eye className="mx-auto mb-1" size={16} />{views}</span>
                        <span className="rounded-2xl bg-gray-100 px-3 py-2 text-sm font-black"><Phone className="mx-auto mb-1" size={16} />{phones}</span>
                        <span className="rounded-2xl bg-gray-100 px-3 py-2 text-sm font-black"><MessageCircle className="mx-auto mb-1" size={16} />{chats}</span>
                      </div>
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
