"use client";

import { useAuth } from "@/components/AuthProvider";
import VerifiedBadge from "@/components/VerifiedBadge";
import { db } from "@/lib/firebase";
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  Ban,
  CheckCircle2,
  Clock3,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { collection, doc, getDocs, limit, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

type RequestItem = {
  id: string;
  userId: string;
  email?: string;
  name?: string;
  phone?: string;
  city?: string;
  category?: string;
  experience?: string;
  message?: string;
  status: "pending" | "approved" | "rejected";
  moderatorComment?: string;
  profileSnapshot?: { avatarUrl?: string };
  createdAt?: any;
};

function isModerator(profile: any, user: any) {
  if (!user) return false;
  return Boolean(
    profile?.role === "moderator" ||
      profile?.role === "admin" ||
      profile?.isModerator === true ||
      profile?.moderator === true ||
      profile?.isAdmin === true
  );
}

export default function ModeratorVerificationPage() {
  const authContext = useAuth() as any;
  const user = authContext?.user || null;
  const profile = authContext?.profile || null;

  const canModerate = useMemo(() => isModerator(profile, user), [profile, user]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [activeId, setActiveId] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    if (!canModerate) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const snap = await getDocs(query(collection(db, "verificationRequests"), where("status", "==", filter), limit(100)));
      const list = snap.docs
        .map((item) => ({ id: item.id, ...(item.data() as any) }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      setRequests(list);
      setActiveId(list[0]?.id || "");
    } catch (err) {
      console.error(err);
      setError("Не получилось загрузить заявки. Проверь права Firestore.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canModerate, filter]);

  const active = requests.find((item) => item.id === activeId) || requests[0] || null;

  async function updateListings(userId: string, verified: boolean) {
    const fields = ["userId", "authorId", "ownerId", "creatorId", "uid"];

    for (const field of fields) {
      try {
        const snap = await getDocs(query(collection(db, "listings"), where(field, "==", userId), limit(80)));
        await Promise.all(
          snap.docs.map((item) =>
            updateDoc(doc(db, "listings", item.id), {
              verified,
              isVerified: verified,
              verifiedAt: verified ? serverTimestamp() : null,
            })
          )
        );
      } catch (err) {
        console.warn(`Не получилось обновить listings по ${field}`, err);
      }
    }
  }

  async function approve(item: RequestItem) {
    if (!canModerate || !user?.uid) return;
    setActionId(item.id);
    setError("");
    setSuccess("");

    try {
      await updateDoc(doc(db, "users", item.userId), {
        verified: true,
        isVerified: true,
        verificationStatus: "approved",
        verifiedAt: serverTimestamp(),
        verifiedBy: user.uid,
      });

      await updateDoc(doc(db, "verificationRequests", item.id), {
        status: "approved",
        reviewedAt: serverTimestamp(),
        reviewedBy: user.uid,
        moderatorComment: comment.trim(),
        updatedAt: serverTimestamp(),
      });

      await updateListings(item.userId, true);
      setSuccess(`Профиль ${item.name || item.email || item.userId} теперь проверен.`);
      setComment("");
      await load();
    } catch (err) {
      console.error(err);
      setError("Не получилось выдать галочку. Проверь права Firestore.");
    } finally {
      setActionId("");
    }
  }

  async function reject(item: RequestItem) {
    if (!canModerate || !user?.uid) return;
    setActionId(item.id);
    setError("");
    setSuccess("");

    try {
      await updateDoc(doc(db, "users", item.userId), {
        verified: false,
        isVerified: false,
        verificationStatus: "rejected",
      });

      await updateDoc(doc(db, "verificationRequests", item.id), {
        status: "rejected",
        reviewedAt: serverTimestamp(),
        reviewedBy: user.uid,
        moderatorComment:
          comment.trim() || "Профиль пока не прошёл проверку. Исправьте данные и отправьте заявку повторно.",
        updatedAt: serverTimestamp(),
      });

      await updateListings(item.userId, false);
      setSuccess("Заявка отклонена.");
      setComment("");
      await load();
    } catch (err) {
      console.error(err);
      setError("Не получилось отклонить заявку. Проверь права Firestore.");
    } finally {
      setActionId("");
    }
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 text-slate-950 md:px-6">
        <div className="mx-auto max-w-3xl rounded-[34px] bg-white p-8 text-center shadow-sm ring-1 ring-blue-100">
          <ShieldAlert className="mx-auto text-blue-600" size={48} />
          <h1 className="mt-4 text-3xl font-black">Нужно войти</h1>
          <Link href="/auth" className="mt-5 inline-flex rounded-2xl bg-[#0057ff] px-6 py-4 text-sm font-black text-white">Войти</Link>
        </div>
      </main>
    );
  }

  if (!canModerate) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 text-slate-950 md:px-6">
        <div className="mx-auto max-w-3xl rounded-[34px] bg-white p-8 text-center shadow-sm ring-1 ring-blue-100">
          <ShieldAlert className="mx-auto text-red-600" size={48} />
          <h1 className="mt-4 text-3xl font-black">Нет доступа</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            В Firestore в документе этого пользователя добавь поле:
          </p>
          <pre className="mt-5 rounded-2xl bg-slate-950 p-4 text-left text-sm font-bold text-white">{`role: "moderator"

или

isModerator: true`}</pre>
          <Link href="/" className="mt-5 inline-flex rounded-2xl bg-[#0057ff] px-6 py-4 text-sm font-black text-white">На главную</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 text-slate-950 md:px-6">
      <div className="mx-auto max-w-7xl">
        <Link href="/" className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-blue-700 shadow-sm ring-1 ring-blue-100">
          <ArrowLeft size={18} /> На главную
        </Link>

        <section className="mt-7 rounded-[42px] bg-[#0057ff] p-6 text-white shadow-2xl shadow-blue-500/20 md:p-10">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-3 text-sm font-black ring-1 ring-white/20"><ShieldCheck size={18} /> Панель модератора</div>
              <h1 className="mt-6 text-4xl font-black leading-tight md:text-6xl">Проверка исполнителей</h1>
              <p className="mt-4 max-w-2xl text-base font-medium leading-8 text-blue-50 md:text-lg">
                Заявки приходят сюда. Модератор нажимает одну кнопку — и у профиля появляется галочка.
              </p>
            </div>
            <button onClick={load} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-sm font-black text-[#0057ff] shadow-lg shadow-blue-950/10"><RefreshCcw size={18} />Обновить</button>
          </div>
        </section>

        <section className="mt-7 grid gap-4 md:grid-cols-3">
          {(["pending", "approved", "rejected"] as const).map((item) => (
            <button key={item} onClick={() => setFilter(item)} className={`rounded-3xl p-5 text-left shadow-sm ring-1 transition ${filter === item ? "bg-[#0057ff] text-white ring-blue-500" : "bg-white text-slate-950 ring-blue-100 hover:bg-blue-50"}`}>
              <p className="text-2xl font-black">{item === "pending" ? "На проверке" : item === "approved" ? "Одобрено" : "Отклонено"}</p>
              <p className={`mt-1 text-sm font-bold ${filter === item ? "text-blue-50" : "text-slate-500"}`}>Фильтр заявок</p>
            </button>
          ))}
        </section>

        {error && <div className="mt-7 flex gap-3 rounded-3xl bg-red-50 p-5 text-sm font-bold text-red-700 ring-1 ring-red-100"><AlertCircle size={20} />{error}</div>}
        {success && <div className="mt-7 flex gap-3 rounded-3xl bg-green-50 p-5 text-sm font-bold text-green-700 ring-1 ring-green-100"><CheckCircle2 size={20} />{success}</div>}

        <section className="mt-7 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-[34px] bg-white p-5 shadow-sm ring-1 ring-blue-100">
            <h2 className="text-2xl font-black">Заявки</h2>
            {loading ? (
              <div className="flex min-h-80 items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={38} /></div>
            ) : requests.length === 0 ? (
              <div className="mt-5 rounded-3xl bg-blue-50 p-6 text-center ring-1 ring-blue-100"><Clock3 className="mx-auto text-blue-600" size={42} /><p className="mt-3 text-lg font-black">Заявок нет</p></div>
            ) : (
              <div className="mt-5 max-h-[700px] space-y-3 overflow-y-auto pr-1">
                {requests.map((item) => (
                  <button key={item.id} onClick={() => setActiveId(item.id)} className={`w-full rounded-3xl p-4 text-left transition ${active?.id === item.id ? "bg-blue-50 ring-2 ring-blue-500" : "bg-slate-50 ring-1 ring-slate-100 hover:bg-blue-50"}`}>
                    <div className="flex gap-3">
                      {item.profileSnapshot?.avatarUrl ? <img src={item.profileSnapshot.avatarUrl} alt={item.name || "Пользователь"} className="h-14 w-14 rounded-2xl object-cover" /> : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-600 ring-1 ring-blue-100"><UserRound size={26} /></div>}
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{item.name || item.email || item.userId}</p><p className="mt-1 text-xs font-bold text-slate-500">{item.category || "Категория"} · {item.city || "Город"}</p><p className="mt-2 inline-flex rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700 ring-1 ring-blue-100">{item.status}</p></div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[34px] bg-white p-6 shadow-sm ring-1 ring-blue-100">
            {active ? (
              <>
                <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                  <div><h2 className="text-3xl font-black">{active.name || "Заявка на проверку"}</h2><p className="mt-2 text-sm font-semibold text-slate-500">ID пользователя: {active.userId}</p></div>
                  {active.status === "approved" ? <VerifiedBadge size="lg" /> : <span className="rounded-2xl bg-blue-50 px-5 py-3 text-sm font-black text-blue-700 ring-1 ring-blue-100">{active.status}</span>}
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <Info icon={<Mail />} label="Email" value={active.email || "Не указан"} />
                  <Info icon={<Phone />} label="Телефон" value={active.phone || "Не указан"} />
                  <Info icon={<MapPin />} label="Город" value={active.city || "Не указан"} />
                  <Info icon={<BadgeCheck />} label="Категория" value={active.category || "Не указана"} />
                </div>

                <div className="mt-5 rounded-3xl bg-blue-50 p-5 ring-1 ring-blue-100"><p className="text-sm font-black text-blue-700">Опыт</p><p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{active.experience || "Не указан"}</p></div>
                <div className="mt-5 rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-100"><p className="text-sm font-black text-slate-700">Сообщение</p><p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-600">{active.message || "Нет сообщения"}</p></div>

                <label className="mt-5 block"><span className="mb-2 block text-sm font-black text-slate-700">Комментарий модератора</span><textarea value={comment} onChange={(e) => setComment(e.target.value)} className="input min-h-28 resize-none" placeholder="Например: профиль проверен..." /></label>

                {active.status === "pending" && (
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <button onClick={() => approve(active)} disabled={Boolean(actionId)} className="inline-flex items-center justify-center gap-3 rounded-3xl bg-[#0057ff] px-6 py-5 text-base font-black text-white shadow-xl shadow-blue-500/20 transition hover:bg-[#0047d6] disabled:opacity-60">{actionId === active.id ? <Loader2 className="animate-spin" size={22} /> : <BadgeCheck size={22} />}Выдать галочку</button>
                    <button onClick={() => reject(active)} disabled={Boolean(actionId)} className="inline-flex items-center justify-center gap-3 rounded-3xl bg-red-50 px-6 py-5 text-base font-black text-red-700 ring-1 ring-red-100 transition hover:bg-red-100 disabled:opacity-60">{actionId === active.id ? <Loader2 className="animate-spin" size={22} /> : <Ban size={22} />}Отклонить</button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex min-h-96 items-center justify-center text-center"><div><ShieldCheck className="mx-auto text-blue-600" size={52} /><h2 className="mt-4 text-2xl font-black">Выбери заявку</h2></div></div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-100">
      <div className="text-blue-600">{icon}</div>
      <p className="mt-3 text-sm font-black">{label}</p>
      <p className="mt-1 break-all text-sm font-semibold text-slate-500">{value}</p>
    </div>
  );
}
