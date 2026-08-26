"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  CalendarCheck2,
  Camera,
  CircleDollarSign,
  Clock3,
  Edit3,
  ImagePlus,
  Layers3,
  Loader2,
  MapPin,
  Maximize2,
  Ruler,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

type PortfolioCase = {
  id: string;
  userId: string;
  title: string;
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
  createdAt?: any;
  updatedAt?: any;
};

type UploadedFile = { url: string; path: string; type: "image" | "video"; name: string };
type ImageRole = "cover" | "before" | "after";

const CATEGORIES = [
  "Ремонт квартир",
  "Дома и коттеджи",
  "Сантехника",
  "Электрика",
  "Фасады",
  "Кровля",
  "Ландшафт",
  "Офисы",
  "Другое",
];

function emptyForm() {
  return {
    title: "",
    description: "",
    category: CATEGORIES[0],
    city: "",
    duration: "",
    cost: "",
    area: "",
    materials: "",
    completedAt: "",
  };
}

function formatPrice(value?: number | null) {
  return value ? `${value.toLocaleString("ru-RU")} ₽` : "Стоимость не указана";
}

export default function PortfolioPage() {
  const { user, loading } = useAuth();
  const formRef = useRef<HTMLDivElement | null>(null);
  const [items, setItems] = useState<PortfolioCase[]>([]);
  const [editing, setEditing] = useState<PortfolioCase | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [roleFiles, setRoleFiles] = useState<Record<ImageRole, File | null>>({ cover: null, before: null, after: null });
  const [rolePreviews, setRolePreviews] = useState<Record<ImageRole, string>>({ cover: "", before: "", after: "" });
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);
  const [existingGallery, setExistingGallery] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "portfolio"), where("userId", "==", user.uid));
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as PortfolioCase[];
      data.sort((a, b) => (b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0));
      setItems(data);
    });
  }, [user]);

  const totalPhotos = useMemo(() => items.reduce((total, item) => total + new Set([item.coverUrl, item.beforeUrl, item.afterUrl, ...(item.imageUrls || [])].filter(Boolean)).size, 0), [items]);

  function resetEditor() {
    Object.values(rolePreviews).forEach((url) => url && URL.revokeObjectURL(url));
    galleryPreviews.forEach((url) => URL.revokeObjectURL(url));
    setEditing(null);
    setForm(emptyForm());
    setRoleFiles({ cover: null, before: null, after: null });
    setRolePreviews({ cover: "", before: "", after: "" });
    setGalleryFiles([]);
    setGalleryPreviews([]);
    setExistingGallery([]);
    setMessage("");
  }

  function startEdit(item: PortfolioCase) {
    resetEditor();
    setEditing(item);
    setForm({
      title: item.title || "",
      description: item.description || "",
      category: item.category || CATEGORIES[0],
      city: item.city || "",
      duration: item.duration || "",
      cost: item.cost ? String(item.cost) : "",
      area: item.area ? String(item.area) : "",
      materials: item.materials || "",
      completedAt: item.completedAt || "",
    });
    setExistingGallery(item.imageUrls || []);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  }

  function chooseRole(role: ImageRole, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    if (rolePreviews[role]) URL.revokeObjectURL(rolePreviews[role]);
    setRoleFiles((current) => ({ ...current, [role]: file }));
    setRolePreviews((current) => ({ ...current, [role]: URL.createObjectURL(file) }));
  }

  function chooseGallery(event: ChangeEvent<HTMLInputElement>) {
    const remaining = Math.max(0, 12 - existingGallery.length - galleryFiles.length);
    const selected = Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/")).slice(0, remaining);
    event.target.value = "";
    setGalleryFiles((current) => [...current, ...selected]);
    setGalleryPreviews((current) => [...current, ...selected.map((file) => URL.createObjectURL(file))]);
  }

  function removeNewGallery(index: number) {
    URL.revokeObjectURL(galleryPreviews[index]);
    setGalleryFiles((current) => current.filter((_, i) => i !== index));
    setGalleryPreviews((current) => current.filter((_, i) => i !== index));
  }

  async function uploadFile(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", "portfolio");
    const response = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Не получилось загрузить изображение.");
    return data as UploadedFile;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user || saving) return;
    if (form.title.trim().length < 3) { setMessage("Название кейса должно быть не короче 3 символов."); return; }

    const hasPhoto = Boolean(
      roleFiles.cover || roleFiles.before || roleFiles.after || galleryFiles.length ||
      editing?.coverUrl || editing?.beforeUrl || editing?.afterUrl || existingGallery.length
    );
    if (!hasPhoto) { setMessage("Добавьте хотя бы одну фотографию проекта."); return; }

    setSaving(true);
    setMessage("Загружаем фотографии...");
    try {
      const uploadedRoles: Partial<Record<ImageRole, UploadedFile>> = {};
      for (const role of ["cover", "before", "after"] as ImageRole[]) {
        const file = roleFiles[role];
        if (file) uploadedRoles[role] = await uploadFile(file);
      }
      const uploadedGallery: UploadedFile[] = [];
      for (const file of galleryFiles) uploadedGallery.push(await uploadFile(file));

      const beforeUrl = uploadedRoles.before?.url || editing?.beforeUrl || "";
      const afterUrl = uploadedRoles.after?.url || editing?.afterUrl || "";
      const galleryUrls = [...existingGallery, ...uploadedGallery.map((item) => item.url)].slice(0, 12);
      const coverUrl = uploadedRoles.cover?.url || editing?.coverUrl || afterUrl || beforeUrl || galleryUrls[0] || "";
      const payload = {
        userId: user.uid,
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        city: form.city.trim(),
        duration: form.duration.trim(),
        cost: form.cost ? Number(form.cost) : null,
        area: form.area ? Number(form.area) : null,
        materials: form.materials.trim(),
        completedAt: form.completedAt,
        coverUrl,
        beforeUrl,
        afterUrl,
        imageUrls: galleryUrls,
        imagePaths: uploadedGallery.map((item) => item.path),
        updatedAt: serverTimestamp(),
      };

      if (editing) await updateDoc(doc(db, "portfolio", editing.id), payload);
      else await addDoc(collection(db, "portfolio"), { ...payload, createdAt: serverTimestamp() });

      resetEditor();
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не получилось сохранить кейс.");
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(item: PortfolioCase) {
    if (!confirm(`Удалить кейс «${item.title}»?`)) return;
    await deleteDoc(doc(db, "portfolio", item.id));
    if (editing?.id === item.id) resetEditor();
  }

  if (loading) return <main className="app-page">Загрузка...</main>;
  if (!user) return <main className="app-page"><div className="empty-card"><h1>Сначала войди в аккаунт</h1><Link href="/auth" className="btn-primary mt-5">Войти</Link></div></main>;

  const rolePreview = (role: ImageRole) => rolePreviews[role] || (role === "cover" ? editing?.coverUrl : role === "before" ? editing?.beforeUrl : editing?.afterUrl) || "";

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-3 py-6 sm:px-5 sm:py-10">
      <div className="mx-auto max-w-7xl">
        <section className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-[#0048dc] via-[#0057ff] to-[#3182ff] p-5 text-white shadow-xl shadow-blue-900/15 sm:rounded-[38px] sm:p-9">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Link href="/profile" className="inline-flex items-center gap-2 rounded-full bg-white/13 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] ring-1 ring-white/20"><ArrowLeft size={15} /> Личный кабинет</Link>
              <h1 className="mt-4 text-3xl font-black tracking-[-0.04em] sm:text-5xl">Портфолио</h1>
              <p className="mt-3 max-w-2xl font-semibold text-blue-100">Покажите заказчику задачу, процесс, материалы, сроки, стоимость и результат.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-[22px] bg-white/13 px-5 py-4 text-center ring-1 ring-white/20"><div className="text-3xl font-black">{items.length}</div><div className="text-xs font-black text-blue-100">кейсов</div></div>
              <div className="rounded-[22px] bg-white/13 px-5 py-4 text-center ring-1 ring-white/20"><div className="text-3xl font-black">{totalPhotos}</div><div className="text-xs font-black text-blue-100">фото</div></div>
            </div>
          </div>
        </section>

        <div className="mt-5 grid gap-6 xl:grid-cols-[410px_minmax(0,1fr)]">
          <div ref={formRef} className="scroll-mt-28">
            <form onSubmit={handleSubmit} className="rounded-[30px] bg-white p-5 shadow-sm ring-1 ring-slate-200/70 xl:sticky xl:top-28 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0057ff]"><BriefcaseBusiness size={23} /></span><div><h2 className="text-2xl font-black text-slate-950">{editing ? "Редактирование кейса" : "Новый кейс"}</h2><p className="text-sm font-bold text-slate-400"></p></div></div>
                {editing ? <button type="button" onClick={resetEditor} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><X size={18} /></button> : null}
              </div>

              <div className="mt-5 space-y-3">
                <input className="input" placeholder="Название проекта" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <select className="input" value={form.category} onChange={(e)=>setForm({...form,category:e.target.value})}>{CATEGORIES.map((item)=><option key={item}>{item}</option>)}</select>
                  <input className="input" placeholder="Город или объект" value={form.city} onChange={(e)=>setForm({...form,city:e.target.value})} />
                </div>
                <textarea className="input min-h-32 resize-none" placeholder="Что было сделано и какой результат получил заказчик" value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})} />
                <div className="grid grid-cols-2 gap-3">
                  <input className="input" placeholder="Срок, например 14 дней" value={form.duration} onChange={(e)=>setForm({...form,duration:e.target.value})} />
                  <input className="input" type="number" min="0" placeholder="Стоимость, ₽" value={form.cost} onChange={(e)=>setForm({...form,cost:e.target.value})} />
                  <input className="input" type="number" min="0" step="0.1" placeholder="Площадь, м²" value={form.area} onChange={(e)=>setForm({...form,area:e.target.value})} />
                  <input className="input" type="month" value={form.completedAt} onChange={(e)=>setForm({...form,completedAt:e.target.value})} />
                </div>
                <textarea className="input min-h-24 resize-none" placeholder="Материалы и решения" value={form.materials} onChange={(e)=>setForm({...form,materials:e.target.value})} />
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                {(["cover","before","after"] as ImageRole[]).map((role) => {
                  const labels = { cover: "Обложка", before: "Фото до", after: "Фото после" };
                  const icons = { cover: ImagePlus, before: Camera, after: Sparkles };
                  const Icon = icons[role]; const preview = rolePreview(role);
                  return <label key={role} className="group relative flex min-h-28 cursor-pointer overflow-hidden rounded-[22px] border border-dashed border-blue-200 bg-blue-50/50 transition hover:-translate-y-0.5 hover:border-[#0057ff]">
                    {preview ? <img src={preview} alt={labels[role]} className="absolute inset-0 h-full w-full object-cover" /> : <span className="m-auto flex flex-col items-center text-[#0057ff]"><Icon size={25}/><span className="mt-2 text-sm font-black">{labels[role]}</span></span>}
                    {preview ? <span className="absolute inset-x-2 bottom-2 rounded-xl bg-slate-950/65 px-3 py-2 text-center text-xs font-black text-white backdrop-blur-sm">Заменить: {labels[role]}</span> : null}
                    <input type="file" accept="image/*" className="hidden" onChange={(e)=>chooseRole(role,e)} />
                  </label>;
                })}
              </div>

              <label className="mt-3 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-[22px] border border-dashed border-blue-200 bg-blue-50/50 text-center text-[#0057ff] transition hover:border-[#0057ff]">
                <ImagePlus size={24}/><span className="mt-2 font-black">Дополнительные фотографии</span><span className="mt-1 text-xs font-bold text-slate-400">До 12 изображений</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={chooseGallery} />
              </label>

              {(existingGallery.length > 0 || galleryPreviews.length > 0) ? <div className="mt-3 grid grid-cols-4 gap-2">
                {existingGallery.map((url,index)=><div key={`old-${url}-${index}`} className="relative aspect-square overflow-hidden rounded-xl"><img src={url} alt="" className="h-full w-full object-cover"/><button type="button" onClick={()=>setExistingGallery((current)=>current.filter((_,i)=>i!==index))} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/70 text-white"><X size={13}/></button></div>)}
                {galleryPreviews.map((url,index)=><div key={`new-${url}`} className="relative aspect-square overflow-hidden rounded-xl"><img src={url} alt="" className="h-full w-full object-cover"/><button type="button" onClick={()=>removeNewGallery(index)} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/70 text-white"><X size={13}/></button></div>)}
              </div> : null}

              {message ? <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm font-black text-amber-700">{message}</p> : null}
              <button disabled={saving} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#0057ff] px-5 font-black text-white shadow-lg shadow-blue-500/20 transition hover:-translate-y-0.5 disabled:opacity-60">
                {saving ? <Loader2 className="animate-spin" size={19}/> : editing ? <Save size={19}/> : <ImagePlus size={19}/>} {saving ? "Сохраняем..." : editing ? "Сохранить изменения" : "Опубликовать кейс"}
              </button>
            </form>
          </div>

          <section>
            <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#0057ff]">Публичное портфолио</p><h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950 sm:text-4xl">Мои кейсы</h2></div><p className="font-bold text-slate-400">{items.length}</p></div>
            {items.length === 0 ? <div className="mt-5 rounded-[30px] bg-white px-6 py-14 text-center shadow-sm ring-1 ring-dashed ring-blue-200"><Layers3 className="mx-auto text-[#0057ff]" size={40}/><h3 className="mt-4 text-2xl font-black">Портфолио пока пустое</h3><p className="mt-2 text-slate-500">Добавьте первый полноценный кейс.</p></div> : <div className="mt-5 grid gap-5 md:grid-cols-2">
              {items.map((item,index)=>{
                const cover=item.coverUrl||item.afterUrl||item.beforeUrl||item.imageUrls?.[0]||"";
                return <article key={item.id} className="portfolio-case-enter group overflow-hidden rounded-[30px] bg-white shadow-sm ring-1 ring-slate-200/70 transition duration-500 hover:-translate-y-2 hover:shadow-[0_24px_60px_rgba(15,23,42,0.14)]" style={{animationDelay:`${Math.min(index*55,350)}ms`}}>
                  <Link href={`/portfolio/${item.id}`} className="block">
                    <div className="relative h-56 overflow-hidden bg-blue-50">{cover?<img src={cover} alt={item.title} className="h-full w-full object-cover transition duration-700 group-hover:scale-110"/>:<div className="flex h-full items-center justify-center text-2xl font-black text-blue-200">Стройка.ру</div>}
                      <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1.5 text-xs font-black text-[#0057ff] shadow-sm">{item.category||"Проект"}</span>
                      {item.beforeUrl&&item.afterUrl?<span className="absolute right-3 top-3 rounded-full bg-[#0057ff] px-3 py-1.5 text-xs font-black text-white">До / после</span>:null}
                    </div>
                    <div className="p-5"><h3 className="text-xl font-black text-slate-950">{item.title}</h3><div className="mt-3 flex flex-wrap gap-2 text-xs font-black text-slate-500">{item.city?<span className="case-meta"><MapPin size={14}/>{item.city}</span>:null}{item.duration?<span className="case-meta"><Clock3 size={14}/>{item.duration}</span>:null}{item.area?<span className="case-meta"><Ruler size={14}/>{item.area} м²</span>:null}</div>{item.description?<p className="mt-3 line-clamp-3 text-sm font-medium leading-6 text-slate-500">{item.description}</p>:null}<p className="mt-4 text-lg font-black text-[#0057ff]">{formatPrice(item.cost)}</p></div>
                  </Link>
                  <div className="flex gap-2 border-t border-slate-100 p-3"><button type="button" onClick={()=>startEdit(item)} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-50 text-sm font-black text-[#0057ff]"><Edit3 size={16}/>Редактировать</button><button type="button" onClick={()=>removeItem(item)} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-500"><Trash2 size={17}/></button></div>
                </article>;
              })}
            </div>}
          </section>
        </div>
      </div>
    </main>
  );
}
