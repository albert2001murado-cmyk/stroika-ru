"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import {
  ArrowLeft,
  BriefcaseBusiness,
  ImagePlus,
  Loader2,
  MapPin,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";

type PortfolioItem = {
  id: string;
  userId: string;
  title: string;
  description?: string;
  city?: string;
  imageUrls?: string[];
  createdAt?: any;
};

type UploadedFile = {
  url: string;
  path: string;
  type: "image" | "video";
  name: string;
};

export default function PortfolioPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "portfolio"), where("userId", "==", user.uid));
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      })) as PortfolioItem[];

      data.sort(
        (a, b) =>
          (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
      );
      setItems(data);
    });
  }, [user]);

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || [])
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, Math.max(0, 8 - files.length));

    setFiles((current) => [...current, ...selected].slice(0, 8));
    setPreviews((current) => [
      ...current,
      ...selected.map((file) => URL.createObjectURL(file)),
    ].slice(0, 8));
    event.target.value = "";
  }

  function removeFile(index: number) {
    URL.revokeObjectURL(previews[index]);
    setFiles((current) => current.filter((_, i) => i !== index));
    setPreviews((current) => current.filter((_, i) => i !== index));
  }

  async function uploadFile(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", "portfolio");

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Не получилось загрузить изображение.");
    }

    return data as UploadedFile;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user || !title.trim()) return;

    setSaving(true);
    setMessage("");

    try {
      const uploaded = [];
      for (const file of files) {
        uploaded.push(await uploadFile(file));
      }

      await addDoc(collection(db, "portfolio"), {
        userId: user.uid,
        title: title.trim(),
        description: description.trim(),
        city: city.trim(),
        imageUrls: uploaded.map((item) => item.url),
        imagePaths: uploaded.map((item) => item.path),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      previews.forEach((url) => URL.revokeObjectURL(url));
      setTitle("");
      setDescription("");
      setCity("");
      setFiles([]);
      setPreviews([]);
      setMessage("Работа добавлена в портфолио.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не получилось сохранить работу."
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(id: string) {
    if (!confirm("Удалить эту работу из портфолио?")) return;
    await deleteDoc(doc(db, "portfolio", id));
  }

  if (loading) return <main className="app-page">Загрузка...</main>;

  if (!user) {
    return (
      <main className="app-page">
        <div className="empty-card">
          <h1>Сначала войди в аккаунт</h1>
          <Link href="/auth" className="btn-primary mt-5">Войти</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="app-page">
      <div className="app-container">
        <div className="page-title-row">
          <Link href="/profile" className="icon-button"><ArrowLeft size={21} /></Link>
          <div>
            <p className="page-eyebrow">Профиль исполнителя</p>
            <h1 className="page-title">Портфолио</h1>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
          <form onSubmit={handleSubmit} className="panel h-fit lg:sticky lg:top-28">
            <div className="flex items-center gap-3">
              <BriefcaseBusiness className="text-[#0057ff]" />
              <h2 className="text-2xl font-black">Добавить работу</h2>
            </div>

            <div className="mt-5 space-y-3">
              <input className="input" placeholder="Название работы" value={title} onChange={(e) => setTitle(e.target.value)} />
              <input className="input" placeholder="Город или объект" value={city} onChange={(e) => setCity(e.target.value)} />
              <textarea className="input min-h-32 resize-none" placeholder="Кратко опишите выполненную работу" value={description} onChange={(e) => setDescription(e.target.value)} />

              <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed border-blue-200 bg-blue-50/50 text-center text-[#0057ff]">
                <ImagePlus size={27} />
                <span className="mt-2 font-black">Добавить фотографии</span>
                <span className="mt-1 text-xs font-bold text-gray-500">До 8 изображений</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
              </label>
            </div>

            {previews.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {previews.map((url, index) => (
                  <div key={url} className="relative aspect-square overflow-hidden rounded-2xl">
                    <img src={url} alt="" className="h-full w-full object-cover" />
                    <button type="button" onClick={() => removeFile(index)} className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white">
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {message && <p className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm font-black text-[#0057ff]">{message}</p>}

            <button disabled={saving} className="btn-primary mt-5 w-full">
              {saving ? <Loader2 className="animate-spin" size={19} /> : <ImagePlus size={19} />}
              {saving ? "Сохраняем..." : "Добавить в портфолио"}
            </button>
          </form>

          <section>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-3xl font-black text-gray-950">Мои работы</h2>
                <p className="mt-1 text-gray-500">Всего: {items.length}</p>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="empty-card mt-5">
                <BriefcaseBusiness className="mx-auto text-[#0057ff]" size={38} />
                <h3 className="mt-4">Портфолио пока пустое</h3>
                <p>Добавьте первую выполненную работу.</p>
              </div>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {items.map((item) => (
                  <article key={item.id} className="panel overflow-hidden p-0">
                    <div className="relative h-52 bg-blue-50">
                      {item.imageUrls?.[0] ? (
                        <img src={item.imageUrls[0]} alt={item.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-3xl font-black text-blue-200">Стройка.ру</div>
                      )}
                      <button type="button" onClick={() => removeItem(item.id)} className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-red-500 shadow-lg">
                        <Trash2 size={18} />
                      </button>
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
        </div>
      </div>
    </main>
  );
}
