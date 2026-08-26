"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { AlertCircle, ArrowLeft, Ban, CheckCircle2, Clock3, Flag, Loader2, RefreshCcw, ShieldCheck, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ReportStatus = "open" | "in_progress" | "resolved" | "rejected";
type PublicationStatus = "pending" | "approved" | "rejected";
type Report = { id: string; reporterId?: string; reporterName?: string; targetType?: string; targetId?: string; targetOwnerId?: string; targetTitle?: string; reason?: string; comment?: string; source?: string; status?: ReportStatus; createdAt?: any; targetSnapshot?: { text?: string } };
type Publication = { id: string; kind: "listing" | "request"; title?: string; description?: string; category?: string; subcategory?: string; city?: string; ownerId?: string; ownerName?: string; moderationStatus?: PublicationStatus; moderationReason?: string; createdAt?: any; updatedAt?: any };

function canModerate(profile: any) { return profile?.role === "moderator" || profile?.role === "admin" || profile?.isModerator === true || profile?.isAdmin === true; }
function reportUrl(item: Report) { if (item.targetType === "listing") return `/listing/${item.targetId}`; if (item.targetType === "profile") return `/user/${item.targetId}`; if (item.targetType === "request") return `/requests/${item.targetId}`; if (item.targetType === "chat") return `/messages/${item.targetId}`; return ""; }
function publicationUrl(item: Publication) { return item.kind === "listing" ? `/listing/${item.id}` : `/requests/${item.id}`; }

async function sendModerationNotification(sender: any, item: Publication, status: PublicationStatus, reason: string) {
  if (!sender || !item.ownerId) return;
  try {
    const token = await sender.getIdToken();
    await fetch("/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        recipientId: item.ownerId,
        type: "moderation",
        entityId: item.id,
        title: status === "approved" ? "Публикация одобрена" : "Публикация отклонена",
        body: status === "approved"
          ? `«${item.title || "Публикация"}» прошла модерацию и теперь доступна пользователям.`
          : `«${item.title || "Публикация"}» не прошла модерацию. ${reason}`,
        url: item.kind === "listing" ? `/listing/${item.id}` : `/requests/${item.id}`,
      }),
    });
  } catch (error) {
    console.warn("moderation notification error:", error);
  }
}

export default function ModeratorReportsPage() {
  const { user, profile, loading } = useAuth();
  const [mode, setMode] = useState<"publications" | "reports">("publications");
  const [reports, setReports] = useState<Report[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [reportFilter, setReportFilter] = useState<ReportStatus>("open");
  const [publicationFilter, setPublicationFilter] = useState<PublicationStatus>("pending");
  const [loadingData, setLoadingData] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [message, setMessage] = useState("");
  const moderator = useMemo(() => canModerate(profile), [profile]);

  async function load() {
    try {
      setLoadingData(true);
      const [reportSnap, listingSnap, requestSnap] = await Promise.all([
        getDocs(query(collection(db, "reports"), orderBy("createdAt", "desc"))),
        getDocs(collection(db, "listings")),
        getDocs(collection(db, "customerRequests")),
      ]);
      setReports(reportSnap.docs.map((item) => ({ id: item.id, ...(item.data() as any) })) as Report[]);
      const listingItems = listingSnap.docs.map((item) => { const data = item.data() as any; return { id: item.id, kind: "listing" as const, title: data.title, description: data.description, category: data.category, subcategory: data.subcategory, city: data.city, ownerId: data.authorId, ownerName: data.authorName, moderationStatus: data.moderationStatus || "approved", moderationReason: data.moderationReason, createdAt: data.createdAt, updatedAt: data.updatedAt }; });
      const requestItems = requestSnap.docs.map((item) => { const data = item.data() as any; return { id: item.id, kind: "request" as const, title: data.title, description: data.description, category: data.category, subcategory: data.subcategory, city: data.city, ownerId: data.customerId, ownerName: data.customerName, moderationStatus: data.moderationStatus || "approved", moderationReason: data.moderationReason, createdAt: data.createdAt, updatedAt: data.updatedAt }; });
      setPublications([...listingItems, ...requestItems].sort((a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0)));
    } catch (error) { console.error(error); setMessage("Не получилось загрузить данные модерации."); }
    finally { setLoadingData(false); }
  }

  useEffect(() => { if (!loading && user && moderator) void load(); }, [loading, moderator, user]);

  async function setReportStatus(item: Report, status: ReportStatus) {
    if (!user) return;
    try { setWorkingId(`report-${item.id}`); await updateDoc(doc(db, "reports", item.id), { status, reviewedBy: user.uid, reviewedAt: serverTimestamp(), updatedAt: serverTimestamp() }); setReports((current) => current.map((report) => report.id === item.id ? { ...report, status } : report)); }
    finally { setWorkingId(""); }
  }

  async function blockAccount(item: Report) {
    if (!item.targetOwnerId || !user || !confirm("Заблокировать аккаунт пользователя?")) return;
    try { setWorkingId(`report-${item.id}`); await updateDoc(doc(db, "users", item.targetOwnerId), { moderationStatus: "blocked", moderationBlockedAt: serverTimestamp(), moderationBlockedBy: user.uid, updatedAt: serverTimestamp() }); await setReportStatus(item, "resolved"); setMessage("Пользователь заблокирован."); }
    finally { setWorkingId(""); }
  }

  async function reviewPublication(item: Publication, status: PublicationStatus) {
    if (!user) return;
    let reason = "";
    if (status === "rejected") {
      reason = window.prompt("Укажите причину отклонения:", item.moderationReason || "Публикация не соответствует правилам размещения.")?.trim() || "";
      if (!reason) return;
    }
    const collectionName = item.kind === "listing" ? "listings" : "customerRequests";
    try {
      setWorkingId(`publication-${item.kind}-${item.id}`);
      await updateDoc(doc(db, collectionName, item.id), {
        moderationStatus: status,
        moderationReason: reason,
        moderationReviewedBy: user.uid,
        moderationReviewedAt: serverTimestamp(),
        publishedAt: status === "approved" ? serverTimestamp() : null,
        updatedAt: serverTimestamp(),
      });
      setPublications((current) => current.map((publication) => publication.id === item.id && publication.kind === item.kind ? { ...publication, moderationStatus: status, moderationReason: reason } : publication));
      await sendModerationNotification(user, item, status, reason);
      setMessage(status === "approved" ? "Публикация одобрена." : "Публикация отклонена.");
    } finally { setWorkingId(""); }
  }

  if (loading) return <main className="app-page">Загрузка...</main>;
  if (!user) return <main className="app-page"><div className="empty-card"><h1>Нужно войти</h1><Link href="/auth" className="btn-primary mt-5">Войти</Link></div></main>;
  if (!moderator) return <main className="app-page"><div className="empty-card"><h1>Нет доступа</h1></div></main>;

  const visibleReports = reports.filter((item) => (item.status || "open") === reportFilter);
  const visiblePublications = publications.filter((item) => item.moderationStatus === publicationFilter);

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 text-slate-950 md:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/moderator/verification" className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-blue-700 shadow-sm ring-1 ring-blue-100"><ArrowLeft size={18} />Проверка профилей</Link>
          <button onClick={load} className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-blue-700 shadow-sm ring-1 ring-blue-100"><RefreshCcw size={18} />Обновить</button>
        </div>
        <section className="mt-7 rounded-[40px] bg-[#0057ff] p-7 text-white shadow-2xl shadow-blue-500/20 md:p-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-3 text-sm font-black ring-1 ring-white/20"><ShieldCheck size={18} />Панель модератора</div>
          <h1 className="mt-5 text-4xl font-black md:text-6xl">Модерация платформы</h1>
          <p className="mt-3 max-w-2xl font-semibold leading-7 text-blue-50">Новые анкеты исполнителей и заявки заказчиков публикуются только после одобрения.</p>
        </section>
        <div className="mt-6 grid grid-cols-2 gap-3 rounded-3xl bg-white p-2 ring-1 ring-blue-100">
          <button onClick={() => setMode("publications")} className={`rounded-2xl px-5 py-4 font-black ${mode === "publications" ? "bg-[#0057ff] text-white" : "text-slate-500"}`}>Публикации</button>
          <button onClick={() => setMode("reports")} className={`rounded-2xl px-5 py-4 font-black ${mode === "reports" ? "bg-[#0057ff] text-white" : "text-slate-500"}`}>Жалобы</button>
        </div>
        {message ? <div className="mt-5 rounded-2xl bg-green-50 p-4 text-sm font-black text-green-700 ring-1 ring-green-100">{message}</div> : null}

        {mode === "publications" ? (
          <>
            <section className="mt-6 grid gap-3 sm:grid-cols-3">{(["pending", "approved", "rejected"] as const).map((status) => <button key={status} onClick={() => setPublicationFilter(status)} className={`rounded-3xl p-5 text-left font-black ring-1 ${publicationFilter === status ? "bg-[#0057ff] text-white ring-blue-500" : "bg-white text-slate-900 ring-blue-100"}`}><div className="text-xl">{status === "pending" ? "На проверке" : status === "approved" ? "Одобрены" : "Отклонены"}</div><div className={`mt-1 text-sm ${publicationFilter === status ? "text-blue-100" : "text-slate-500"}`}>{publications.filter((item) => item.moderationStatus === status).length}</div></button>)}</section>
            <section className="mt-6 space-y-4">
              {loadingData ? <div className="flex min-h-72 items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={38} /></div> : visiblePublications.length === 0 ? <div className="rounded-[34px] bg-white p-10 text-center ring-1 ring-blue-100"><Clock3 className="mx-auto text-blue-600" size={44} /><h2 className="mt-3 text-2xl font-black">Публикаций нет</h2></div> : visiblePublications.map((item) => (
                <article key={`${item.kind}-${item.id}`} className="rounded-[32px] bg-white p-6 shadow-sm ring-1 ring-blue-100">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{item.kind === "listing" ? "Анкета исполнителя" : "Заявка заказчика"}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{item.category || "Без категории"}</span></div><h2 className="mt-4 text-2xl font-black">{item.title || "Без названия"}</h2><p className="mt-2 text-sm font-bold text-slate-500">Автор: {item.ownerName || item.ownerId} · {item.city || "Город не указан"}</p><p className="mt-4 line-clamp-4 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-700">{item.description || "Описание отсутствует"}</p>{item.moderationReason ? <p className="mt-3 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">Причина: {item.moderationReason}</p> : null}</div><Link href={publicationUrl(item)} className="shrink-0 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 ring-1 ring-blue-100">Открыть</Link></div>
                  <div className="mt-5 flex flex-wrap gap-2"><button disabled={workingId === `publication-${item.kind}-${item.id}`} onClick={() => reviewPublication(item, "approved")} className="inline-flex items-center gap-2 rounded-2xl bg-green-50 px-4 py-3 text-sm font-black text-green-700 ring-1 ring-green-100"><CheckCircle2 size={17} />Одобрить</button><button disabled={workingId === `publication-${item.kind}-${item.id}`} onClick={() => reviewPublication(item, "rejected")} className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-700 ring-1 ring-red-100"><XCircle size={17} />Отклонить</button></div>
                </article>
              ))}
            </section>
          </>
        ) : (
          <>
            <section className="mt-6 grid gap-3 sm:grid-cols-4">{(["open", "in_progress", "resolved", "rejected"] as const).map((status) => <button key={status} onClick={() => setReportFilter(status)} className={`rounded-3xl p-5 text-left font-black ring-1 ${reportFilter === status ? "bg-[#0057ff] text-white ring-blue-500" : "bg-white text-slate-900 ring-blue-100"}`}><div className="text-xl">{status === "open" ? "Новые" : status === "in_progress" ? "В работе" : status === "resolved" ? "Подтверждены" : "Отклонены"}</div><div className={`mt-1 text-sm ${reportFilter === status ? "text-blue-100" : "text-slate-500"}`}>{reports.filter((item) => (item.status || "open") === status).length}</div></button>)}</section>
            <section className="mt-6 space-y-4">{loadingData ? <div className="flex min-h-72 items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={38} /></div> : visibleReports.length === 0 ? <div className="rounded-[34px] bg-white p-10 text-center ring-1 ring-blue-100"><Clock3 className="mx-auto text-blue-600" size={44} /><h2 className="mt-3 text-2xl font-black">Жалоб нет</h2></div> : visibleReports.map((item) => <article key={item.id} className="rounded-[32px] bg-white p-6 shadow-sm ring-1 ring-blue-100"><div className="flex flex-col gap-4 lg:flex-row lg:justify-between"><div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-600">{item.reason || "Жалоба"}</span><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{item.source || "web"}</span></div><h2 className="mt-4 text-2xl font-black">{item.targetTitle || item.targetId}</h2><p className="mt-2 text-sm font-bold text-slate-500">Отправил: {item.reporterName || item.reporterId}</p>{item.comment ? <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">{item.comment}</p> : null}</div>{reportUrl(item) ? <Link href={reportUrl(item)} className="shrink-0 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-black text-blue-700">Открыть</Link> : null}</div><div className="mt-5 flex flex-wrap gap-2">{item.status === "open" ? <button onClick={() => setReportStatus(item, "in_progress")} className="inline-flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-black text-amber-700"><AlertCircle size={17} />В работу</button> : null}{item.status === "open" || item.status === "in_progress" ? <><button onClick={() => setReportStatus(item, "resolved")} className="inline-flex items-center gap-2 rounded-2xl bg-green-50 px-4 py-3 text-sm font-black text-green-700"><CheckCircle2 size={17} />Подтвердить</button><button onClick={() => setReportStatus(item, "rejected")} className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700"><XCircle size={17} />Отклонить</button></> : null}{item.targetOwnerId ? <button onClick={() => blockAccount(item)} className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-700"><Ban size={17} />Заблокировать</button> : null}</div></article>)}</section>
          </>
        )}
      </div>
    </main>
  );
}
