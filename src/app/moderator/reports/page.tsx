"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { AlertCircle, ArrowLeft, Ban, CheckCircle2, Clock3, Flag, Loader2, RefreshCcw, ShieldCheck, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Report = {
  id: string;
  reporterId?: string;
  reporterName?: string;
  targetType?: string;
  targetId?: string;
  targetOwnerId?: string;
  targetTitle?: string;
  reason?: string;
  comment?: string;
  source?: string;
  status?: "open" | "in_progress" | "resolved" | "rejected";
  createdAt?: any;
  targetSnapshot?: { text?: string; type?: string; chatId?: string; mediaUrl?: string; imageUrl?: string };
};

function canModerate(profile: any) {
  return profile?.role === "moderator" || profile?.role === "admin" || profile?.isModerator === true || profile?.isAdmin === true;
}

function targetUrl(item: Report) {
  if (item.targetType === "listing") return `/listing/${item.targetId}`;
  if (item.targetType === "profile") return `/user/${item.targetId}`;
  if (item.targetType === "request") return `/requests/${item.targetId}`;
  if (item.targetType === "chat") return `/messages/${item.targetId}`;
  return "";
}

export default function ModeratorReportsPage() {
  const { user, profile, loading } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState<Report["status"]>("open");
  const [loadingReports, setLoadingReports] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [message, setMessage] = useState("");

  const moderator = useMemo(() => canModerate(profile), [profile]);
  const visible = reports.filter((item) => item.status === filter);

  async function load() {
    try {
      setLoadingReports(true);
      const snapshot = await getDocs(query(collection(db, "reports"), orderBy("createdAt", "desc")));
      setReports(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as any) })) as Report[]);
    } finally {
      setLoadingReports(false);
    }
  }

  useEffect(() => {
    if (!loading && user && moderator) void load();
  }, [loading, moderator, user]);

  async function setStatus(item: Report, status: NonNullable<Report["status"]>) {
    if (!user) return;
    try {
      setWorkingId(item.id);
      await updateDoc(doc(db, "reports", item.id), {
        status,
        reviewedBy: user.uid,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setReports((current) => current.map((report) => report.id === item.id ? { ...report, status } : report));
      setMessage("Статус жалобы обновлён.");
    } finally {
      setWorkingId("");
    }
  }

  async function blockAccount(item: Report) {
    if (!item.targetOwnerId || !user) return;
    if (!confirm("Заблокировать аккаунт пользователя в сервисе?")) return;
    try {
      setWorkingId(item.id);
      await updateDoc(doc(db, "users", item.targetOwnerId), {
        moderationStatus: "blocked",
        moderationBlockedAt: serverTimestamp(),
        moderationBlockedBy: user.uid,
        updatedAt: serverTimestamp(),
      });
      await setStatus(item, "resolved");
      setMessage("Пользователь заблокирован.");
    } finally {
      setWorkingId("");
    }
  }

  if (loading) return <main className="app-page">Загрузка...</main>;
  if (!user) return <main className="app-page"><div className="empty-card"><h1>Нужно войти</h1><Link href="/auth" className="btn-primary mt-5">Войти</Link></div></main>;
  if (!moderator) return <main className="app-page"><div className="empty-card"><h1>Нет доступа</h1></div></main>;

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 text-slate-950 md:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/moderator/verification" className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-blue-700 shadow-sm ring-1 ring-blue-100"><ArrowLeft size={18} />Проверка профилей</Link>
          <button onClick={load} className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-blue-700 shadow-sm ring-1 ring-blue-100"><RefreshCcw size={18} />Обновить</button>
        </div>

        <section className="mt-7 rounded-[40px] bg-[#0057ff] p-7 text-white shadow-2xl shadow-blue-500/20 md:p-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-3 text-sm font-black ring-1 ring-white/20"><Flag size={18} />Панель модератора</div>
          <h1 className="mt-5 text-4xl font-black md:text-6xl">Жалобы пользователей</h1>
          <p className="mt-3 max-w-2xl font-semibold leading-7 text-blue-50">Жалобы из сайта и мобильного приложения находятся в одном списке.</p>
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-4">
          {(["open", "in_progress", "resolved", "rejected"] as const).map((status) => {
            const labels = { open: "Новые", in_progress: "В работе", resolved: "Подтверждены", rejected: "Отклонены" };
            return <button key={status} onClick={() => setFilter(status)} className={`rounded-3xl p-5 text-left font-black ring-1 ${filter === status ? "bg-[#0057ff] text-white ring-blue-500" : "bg-white text-slate-900 ring-blue-100"}`}><div className="text-xl">{labels[status]}</div><div className={`mt-1 text-sm ${filter === status ? "text-blue-100" : "text-slate-500"}`}>{reports.filter((item) => item.status === status).length}</div></button>;
          })}
        </section>

        {message && <div className="mt-5 rounded-2xl bg-green-50 p-4 text-sm font-black text-green-700 ring-1 ring-green-100">{message}</div>}

        <section className="mt-6 space-y-4">
          {loadingReports ? (
            <div className="flex min-h-72 items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={38} /></div>
          ) : visible.length === 0 ? (
            <div className="rounded-[34px] bg-white p-10 text-center shadow-sm ring-1 ring-blue-100"><Clock3 className="mx-auto text-blue-600" size={44} /><h2 className="mt-3 text-2xl font-black">Жалоб нет</h2></div>
          ) : visible.map((item) => (
            <article key={item.id} className="rounded-[32px] bg-white p-6 shadow-sm ring-1 ring-blue-100">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-600">{item.reason || "Жалоба"}</span><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{item.source || "web"}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{item.targetType}</span></div>
                  <h2 className="mt-4 text-2xl font-black">{item.targetTitle || item.targetId}</h2>
                  <p className="mt-2 text-sm font-bold text-slate-500">Отправил: {item.reporterName || item.reporterId}</p>
                  {item.comment && <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-700">{item.comment}</p>}
                  {item.targetSnapshot?.text ? <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900 ring-1 ring-amber-100">Сообщение: {item.targetSnapshot.text}</p> : null}
                </div>
                {targetUrl(item) && <Link href={targetUrl(item)} className="shrink-0 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 ring-1 ring-blue-100">Открыть объект</Link>}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {item.status === "open" && <button disabled={workingId === item.id} onClick={() => setStatus(item, "in_progress")} className="inline-flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-black text-amber-700 ring-1 ring-amber-100"><AlertCircle size={17} />В работу</button>}
                {(item.status === "open" || item.status === "in_progress") && <button disabled={workingId === item.id} onClick={() => setStatus(item, "resolved")} className="inline-flex items-center gap-2 rounded-2xl bg-green-50 px-4 py-3 text-sm font-black text-green-700 ring-1 ring-green-100"><CheckCircle2 size={17} />Подтвердить</button>}
                {(item.status === "open" || item.status === "in_progress") && <button disabled={workingId === item.id} onClick={() => setStatus(item, "rejected")} className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700 ring-1 ring-slate-200"><XCircle size={17} />Отклонить</button>}
                {item.targetOwnerId && <button disabled={workingId === item.id} onClick={() => blockAccount(item)} className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-700 ring-1 ring-red-100"><Ban size={17} />Заблокировать пользователя</button>}
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
