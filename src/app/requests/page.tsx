"use client";

import CustomerRequestCard from "@/components/CustomerRequestCard";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import type { CustomerRequest } from "@/types";
import { firestoreDateToMillis } from "@/types";
import { collection, onSnapshot } from "firebase/firestore";
import { ArrowLeft, ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function RequestsPage() {
  const { user, loading } = useAuth();
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [tab, setTab] = useState<"all" | "mine">("all");

  useEffect(() => {
    return onSnapshot(collection(db, "customerRequests"), (snapshot) => {
      const data = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      })) as CustomerRequest[];

      data.sort(
        (a, b) =>
          firestoreDateToMillis(b.createdAt) - firestoreDateToMillis(a.createdAt)
      );
      setRequests(data);
    });
  }, []);

  const shown = useMemo(
    () =>
      requests.filter(
        (item) =>
          item.status === "active" &&
          (tab === "all" || item.customerId === user?.uid)
      ),
    [requests, tab, user?.uid]
  );

  if (loading) return <main className="app-page">Загрузка...</main>;

  return (
    <main className="app-page">
      <div className="app-container">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="page-title-row">
            <Link href="/" className="icon-button">
              <ArrowLeft size={21} />
            </Link>
            <div>
              <p className="page-eyebrow">Заказы клиентов</p>
              <h1 className="page-title">Заявки заказчиков</h1>
            </div>
          </div>

          {user ? (
            <Link href="/requests/new" className="btn-primary">
              <Plus size={19} />
              Создать заявку
            </Link>
          ) : null}
        </div>

        <div className="mt-6 inline-flex rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-gray-200">
          <button
            type="button"
            onClick={() => setTab("all")}
            className={`rounded-xl px-5 py-3 text-sm font-black transition ${
              tab === "all"
                ? "bg-[#0057ff] text-white shadow-lg"
                : "text-gray-500 hover:bg-blue-50 hover:text-[#0057ff]"
            }`}
          >
            Все активные ({requests.filter((item) => item.status === "active").length})
          </button>
          <button
            type="button"
            onClick={() => setTab("mine")}
            className={`rounded-xl px-5 py-3 text-sm font-black transition ${
              tab === "mine"
                ? "bg-[#0057ff] text-white shadow-lg"
                : "text-gray-500 hover:bg-blue-50 hover:text-[#0057ff]"
            }`}
          >
            Мои заявки
          </button>
        </div>

        {shown.length === 0 ? (
          <div className="empty-card mt-6">
            <ClipboardList className="mx-auto text-[#0057ff]" size={42} />
            <h3 className="mt-4">Заявок пока нет</h3>
            <p>Здесь появятся активные запросы заказчиков с сайта и мобильного приложения.</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((item) => (
              <CustomerRequestCard key={item.id} request={item} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
