"use client";

import { db } from "@/lib/firebase";
import {
  ArrowLeft,
  CalendarCheck2,
  CircleDollarSign,
  Clock3,
  Images,
  MapPin,
  Ruler,
  Sparkles,
  UserRound,
} from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type PortfolioCase = {
  id: string;
  userId?: string;
  title?: string;
  description?: string;
  category?: string;
  city?: string;
  duration?: string;
  cost?: number | null;
  area?: number | null;
  materials?: string;
  completedAt?: string;
  coverUrl?: string;
  beforeUrl?: string;
  afterUrl?: string;
  imageUrls?: string[];
};

function completedLabel(value?: string) {
  if (!value) return "";
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

export default function PortfolioCasePage() {
  const id = String(useParams()?.id || "");
  const [item, setItem] = useState<PortfolioCase | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState("");
  const [compareMode, setCompareMode] = useState<"before" | "after">("after");
  const [galleryOverride, setGalleryOverride] = useState("");

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, "portfolio", id))
      .then(async (snapshot) => {
        if (!snapshot.exists()) return;
        const data = { id: snapshot.id, ...snapshot.data() } as PortfolioCase;
        setItem(data);
        const first = data.coverUrl || data.afterUrl || data.beforeUrl || data.imageUrls?.[0] || "";
        setActiveImage(first);
        if (data.userId) {
          const userSnap = await getDoc(doc(db, "users", data.userId));
          if (userSnap.exists()) setProfile(userSnap.data());
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const images = useMemo(() => item ? Array.from(new Set([item.coverUrl, item.beforeUrl, item.afterUrl, ...(item.imageUrls || [])].filter(Boolean) as string[])) : [], [item]);

  if (loading) return <main className="app-page">Загрузка...</main>;
  if (!item) return <main className="app-page"><div className="empty-card"><h1>Кейс не найден</h1><Link href="/" className="btn-primary mt-5">На главную</Link></div></main>;

  const name = profile?.displayName || profile?.name || "Исполнитель";
  const avatar = profile?.avatarUrl || profile?.photoURL || "";
  const heroImage = galleryOverride || (item.beforeUrl && item.afterUrl ? (compareMode === "before" ? item.beforeUrl : item.afterUrl) : activeImage);

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-3 py-6 sm:px-5 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <Link href={item.userId ? `/user/${item.userId}` : "/"} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:text-[#0057ff]"><ArrowLeft size={18}/>Назад к профилю</Link>

        <section className="portfolio-case-enter mt-4 overflow-hidden rounded-[34px] bg-white shadow-xl shadow-slate-900/5 ring-1 ring-slate-200/70">
          <div className="relative min-h-[360px] overflow-hidden bg-slate-950 sm:min-h-[520px]">
            {heroImage ? <img src={heroImage} alt={item.title || "Кейс"} className="absolute inset-0 h-full w-full object-contain"/> : <div className="flex min-h-[420px] items-center justify-center text-3xl font-black text-blue-200">Стройка.ру</div>}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-950/80 to-transparent"/>
            <div className="absolute left-4 top-4 flex flex-wrap gap-2 sm:left-6 sm:top-6">
              <span className="rounded-full bg-white/95 px-4 py-2 text-xs font-black text-[#0057ff] shadow-lg">{item.category || "Проект"}</span>
              {item.beforeUrl && item.afterUrl ? <span className="rounded-full bg-[#0057ff] px-4 py-2 text-xs font-black text-white shadow-lg">До / после</span> : null}
            </div>
            {item.beforeUrl && item.afterUrl ? <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 rounded-2xl bg-slate-950/70 p-1.5 backdrop-blur-md"><button onClick={()=>{setGalleryOverride("");setCompareMode("before");}} className={`rounded-xl px-5 py-3 text-sm font-black transition ${compareMode==="before"?"bg-white text-slate-950":"text-white"}`}>До</button><button onClick={()=>{setGalleryOverride("");setCompareMode("after");}} className={`rounded-xl px-5 py-3 text-sm font-black transition ${compareMode==="after"?"bg-[#0057ff] text-white":"text-white"}`}>После</button></div> : null}
          </div>

          {images.length > 1 ? <div className="flex gap-2 overflow-x-auto border-b border-slate-100 p-3 sm:p-4">{images.map((url,index)=><button key={`${url}-${index}`} onClick={()=>{setActiveImage(url); if(url===item.beforeUrl){setGalleryOverride("");setCompareMode("before");}else if(url===item.afterUrl){setGalleryOverride("");setCompareMode("after");}else{setGalleryOverride(url);}}} className={`h-20 w-24 shrink-0 overflow-hidden rounded-2xl ring-2 transition hover:-translate-y-0.5 ${activeImage===url?"ring-[#0057ff]":"ring-transparent"}`}><img src={url} alt="" className="h-full w-full object-cover"/></button>)}</div> : null}

          <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[1fr_320px]">
            <div>
              <h1 className="text-3xl font-black tracking-[-0.04em] text-slate-950 sm:text-5xl">{item.title || "Проект"}</h1>
              {item.description ? <p className="mt-5 whitespace-pre-line text-base font-medium leading-8 text-slate-600">{item.description}</p> : null}
              {item.materials ? <div className="mt-7 rounded-[26px] bg-blue-50 p-5 ring-1 ring-blue-100"><div className="flex items-center gap-3 text-[#0057ff]"><Sparkles size={21}/><h2 className="text-lg font-black">Материалы и решения</h2></div><p className="mt-3 whitespace-pre-line text-sm font-semibold leading-7 text-slate-600">{item.materials}</p></div> : null}
            </div>

            <aside className="space-y-3">
              <Link href={item.userId ? `/user/${item.userId}` : "#"} className="flex items-center gap-3 rounded-[24px] bg-slate-50 p-4 ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:bg-blue-50">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-[#0057ff] shadow-sm">{avatar?<img src={avatar} alt={name} className="h-full w-full object-cover"/>:<UserRound size={23}/>}</span><span className="min-w-0"><span className="block text-xs font-bold text-slate-400">Исполнитель</span><span className="mt-1 block truncate font-black text-slate-950">{name}</span></span>
              </Link>
              {item.city ? <div className="case-detail"><MapPin/><span><small>Объект</small><b>{item.city}</b></span></div> : null}
              {item.duration ? <div className="case-detail"><Clock3/><span><small>Срок выполнения</small><b>{item.duration}</b></span></div> : null}
              {item.cost ? <div className="case-detail"><CircleDollarSign/><span><small>Стоимость</small><b>{item.cost.toLocaleString("ru-RU")} ₽</b></span></div> : null}
              {item.area ? <div className="case-detail"><Ruler/><span><small>Площадь</small><b>{item.area} м²</b></span></div> : null}
              {item.completedAt ? <div className="case-detail"><CalendarCheck2/><span><small>Завершено</small><b className="capitalize">{completedLabel(item.completedAt)}</b></span></div> : null}
              <div className="case-detail"><Images/><span><small>Фотографии</small><b>{images.length}</b></span></div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
