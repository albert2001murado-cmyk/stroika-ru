"use client";

import { useAuth } from "@/components/AuthProvider";
import VerifiedBadge from "@/components/VerifiedBadge";
import { db } from "@/lib/firebase";
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  Phone,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, where } from "firebase/firestore";
import { FormEvent, useEffect, useState } from "react";
import PremiumCategoryGrid from "@/components/PremiumCategoryGrid";

const categories = [
  "Ремонт квартир",
  "Отделочные работы",
  "Электрика",
  "Сантехника",
  "Строительство",
  "Спецтехника",
  "Материалы",
  "Крыша и фасад",
  "Окна и двери",
  "Другое",
];

type LastRequest = {
  id: string;
  status?: "pending" | "approved" | "rejected";
  moderatorComment?: string;
};

export default function VerificationPage() {
  const authContext = useAuth() as any;
  const user = authContext?.user || null;
  const profile = authContext?.profile || null;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState(categories[0]);
  const [experience, setExperience] = useState("");
  const [message, setMessage] = useState("");
  const [lastRequest, setLastRequest] = useState<LastRequest | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setName(profile?.displayName || profile?.name || user?.displayName || "");
    setPhone(profile?.phone || "");
    setCity(profile?.city || "");
  }, [user, profile]);

  useEffect(() => {
    async function load() {
      if (!user?.uid) return;
      setLoading(true);
      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (userSnap.exists()) {
          const data = userSnap.data() as any;
          setVerified(Boolean(data.verified || data.isVerified));
        }

        const reqSnap = await getDocs(
          query(collection(db, "verificationRequests"), where("userId", "==", user.uid))
        );

        const list = reqSnap.docs
          .map((item) => ({ id: item.id, ...(item.data() as any) }))
          .sort((a, b) => {
            const aa = a.createdAt?.seconds || 0;
            const bb = b.createdAt?.seconds || 0;
            return bb - aa;
          });

        setLastRequest(list[0] || null);
      } catch (err) {
        console.error(err);
        setError("Не получилось загрузить статус проверки.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user?.uid]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!user?.uid) return setError("Сначала войди в аккаунт.");
    if (verified) return setError("Профиль уже проверен.");
    if (lastRequest?.status === "pending") return setError("Заявка уже на проверке.");
    if (!name.trim()) return setError("Укажи имя или название компании.");
    if (!phone.trim()) return setError("Укажи телефон.");
    if (!city.trim()) return setError("Укажи город.");
    if (message.trim().length < 20) return setError("Опиши профиль подробнее. Минимум 20 символов.");

    setSending(true);
    try {
      const ref = await addDoc(collection(db, "verificationRequests"), {
        userId: user.uid,
        email: user.email || "",
        name: name.trim(),
        phone: phone.trim(),
        city: city.trim(),
        category,
        experience: experience.trim(),
        message: message.trim(),
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        profileSnapshot: {
          displayName: profile?.displayName || profile?.name || "",
          avatarUrl: profile?.avatarUrl || user?.photoURL || "",
          accountType: profile?.accountType || "",
        },
      });

      setLastRequest({ id: ref.id, status: "pending" });
      setSuccess("Заявка отправлена. Модератор проверит профиль и выдаст галочку.");
    } catch (err) {
      console.error(err);
      setError("Не получилось отправить заявку.");
    } finally {
      setSending(false);
    }
  }

  const status = verified
    ? "Профиль проверен"
    : lastRequest?.status === "pending"
    ? "Заявка на проверке"
    : lastRequest?.status === "rejected"
    ? "Заявку отклонили"
    : "Проверка не пройдена";

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 text-slate-950 md:px-6">
      <div className="mx-auto max-w-7xl">
        <Link href="/profile" className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-blue-700 shadow-sm ring-1 ring-blue-100">
          <ArrowLeft size={18} /> В профиль
        </Link>

        <section className="mt-7 overflow-hidden rounded-[42px] bg-[#0057ff] p-6 text-white shadow-2xl shadow-blue-500/20 md:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-3 text-sm font-black ring-1 ring-white/20">
                <BadgeCheck size={18} /> Проверенные исполнители
              </div>
              <h1 className="mt-6 max-w-3xl text-4xl font-black leading-tight md:text-6xl">
                Получи галочку проверенного исполнителя
              </h1>
              <p className="mt-5 max-w-2xl text-base font-medium leading-8 text-blue-50 md:text-lg">
                Отправь заявку. Модератор проверит профиль и одной кнопкой выдаст статус «Проверенный исполнитель».
              </p>
            </div>

            <div className="rounded-[34px] bg-white p-6 text-slate-950 shadow-2xl">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  {verified ? <BadgeCheck size={30} /> : <Clock3 size={30} />}
                </div>
                <div>
                  <h2 className="text-2xl font-black">{status}</h2>
                  <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                    {verified
                      ? "Теперь на профиле можно показывать синюю галочку."
                      : lastRequest?.status === "pending"
                      ? "Модератор увидит заявку в панели проверки."
                      : lastRequest?.status === "rejected"
                      ? lastRequest.moderatorComment || "Исправь профиль и отправь новую заявку."
                      : "Заполни форму ниже и отправь заявку."}
                  </p>
                  {verified && <div className="mt-4"><VerifiedBadge size="lg" /></div>}
                </div>
              </div>
            </div>
          </div>
        </section>

        {!user ? (
          <section className="mt-7 rounded-[34px] bg-white p-7 text-center shadow-sm ring-1 ring-blue-100">
            <UserRound className="mx-auto text-blue-600" size={44} />
            <h2 className="mt-4 text-2xl font-black">Нужно войти</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-500">
              Заявку на проверку может отправить только авторизованный пользователь.
            </p>
            <Link href="/auth" className="mt-5 inline-flex rounded-2xl bg-[#0057ff] px-6 py-4 text-sm font-black text-white">
              Войти
            </Link>
          </section>
        ) : (
          <section className="mt-7 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-[34px] bg-white p-6 shadow-sm ring-1 ring-blue-100">
              <h2 className="text-2xl font-black">Что проверяет модератор</h2>
              <div className="mt-5 space-y-4">
                <div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-blue-600" size={22} /><p className="text-sm font-semibold leading-6 text-slate-600"><b>Профиль заполнен.</b> Имя, город, телефон, описание и категория.</p></div>
                <div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-blue-600" size={22} /><p className="text-sm font-semibold leading-6 text-slate-600"><b>Исполнитель настоящий.</b> Понятно, кто оказывает услуги или продаёт материалы.</p></div>
                <div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-blue-600" size={22} /><p className="text-sm font-semibold leading-6 text-slate-600"><b>Нет спама.</b> После одобрения на профиле появится галочка.</p></div>
              </div>
            </div>

            <form onSubmit={submit} className="rounded-[34px] bg-white p-6 shadow-sm ring-1 ring-blue-100">
              <h2 className="text-2xl font-black">Заявка на проверку</h2>

              {error && <div className="mt-5 flex gap-3 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700 ring-1 ring-red-100"><AlertCircle size={20} />{error}</div>}
              {success && <div className="mt-5 flex gap-3 rounded-2xl bg-green-50 p-4 text-sm font-bold text-green-700 ring-1 ring-green-100"><CheckCircle2 size={20} />{success}</div>}

              {loading ? (
                <div className="mt-6 flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={38} /></div>
              ) : (
                <div className="mt-6 grid gap-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label><span className="mb-2 block text-sm font-black text-slate-700">Имя / компания</span><input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Например: Альберт Строй" /></label>
                    <label><span className="mb-2 flex items-center gap-2 text-sm font-black text-slate-700"><Phone size={16} />Телефон</span><input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="+7..." /></label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label><span className="mb-2 flex items-center gap-2 text-sm font-black text-slate-700"><MapPin size={16} />Город</span><input value={city} onChange={(e) => setCity(e.target.value)} className="input" placeholder="Москва" /></label>
                    <label><span className="mb-2 block text-sm font-black text-slate-700">Категория</span><select value={category} onChange={(e) => setCategory(e.target.value)} className="input">{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                  </div>
                  <label><span className="mb-2 block text-sm font-black text-slate-700">Опыт работы</span><input value={experience} onChange={(e) => setExperience(e.target.value)} className="input" placeholder="Например: 5 лет, 30 объектов" /></label>
                  <label><span className="mb-2 block text-sm font-black text-slate-700">Почему профиль можно проверить?</span><textarea value={message} onChange={(e) => setMessage(e.target.value)} className="input min-h-36 resize-none" placeholder="Опиши, чем занимаешься, где работаешь, какие услуги оказываешь..." /></label>
                  <button type="submit" disabled={sending || verified || lastRequest?.status === "pending"} className="inline-flex items-center justify-center gap-3 rounded-3xl bg-[#0057ff] px-6 py-5 text-base font-black text-white shadow-xl shadow-blue-500/20 transition hover:bg-[#0047d6] disabled:cursor-not-allowed disabled:opacity-60">
                    {sending ? <Loader2 className="animate-spin" size={22} /> : <Send size={22} />}
                    Отправить заявку
                  </button>
                </div>
              )}
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
