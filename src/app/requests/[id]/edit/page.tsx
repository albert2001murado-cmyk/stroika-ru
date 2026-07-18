"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import type { CustomerRequest, CustomerRequestStatus } from "@/types";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import {
  ArrowLeft,
  CalendarDays,
  ImagePlus,
  Loader2,
  MapPin,
  Save,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";

const REQUEST_CATEGORIES = [
  "Ремонт квартир",
  "Строительство домов",
  "Сантехника",
  "Электрика",
  "Кровля",
  "Фасады",
  "Отделочные работы",
  "Окна и двери",
  "Ландшафтные работы",
  "Демонтаж",
  "Другое",
];

const MAX_IMAGES = 8;

type ExistingImage = {
  id: string;
  url: string;
  existing: true;
};

type LocalImage = {
  id: string;
  file: File;
  previewUrl: string;
  existing: false;
};

type EditableImage = ExistingImage | LocalImage;

function parseMoney(value: string) {
  const normalized = value.replace(/[^\d]/g, "");
  return normalized ? Number(normalized) : null;
}

async function uploadImage(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", "customer-requests");

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || "Не получилось загрузить фотографию.");
  }

  const url = data?.url || data?.fileUrl || data?.media?.url;
  if (!url) throw new Error("Сервер не вернул ссылку на фотографию.");
  return url as string;
}

function isLocalImage(image: EditableImage): image is LocalImage {
  return image.existing === false;
}

export default function EditCustomerRequestPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const requestId =
    typeof params?.id === "string"
      ? params.id
      : Array.isArray(params?.id)
      ? params.id[0]
      : "";

  const [ownerId, setOwnerId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(REQUEST_CATEGORIES[0]);
  const [city, setCity] = useState("");
  const [budgetFrom, setBudgetFrom] = useState("");
  const [budgetTo, setBudgetTo] = useState("");
  const [deadline, setDeadline] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [status, setStatus] = useState<CustomerRequestStatus>("active");
  const [images, setImages] = useState<EditableImage[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadRequest() {
      if (!requestId) {
        setError("Заявка не найдена.");
        setPageLoading(false);
        return;
      }

      try {
        const snapshot = await getDoc(doc(db, "customerRequests", requestId));
        if (!snapshot.exists()) {
          setError("Заявка не найдена.");
          return;
        }

        const data = { id: snapshot.id, ...snapshot.data() } as CustomerRequest;
        setOwnerId(data.customerId || "");
        setTitle(data.title || "");
        setDescription(data.description || "");
        setCategory(data.category || REQUEST_CATEGORIES[0]);
        setCity(data.city || "");
        setBudgetFrom(
          data.budgetFrom != null
            ? String(data.budgetFrom)
            : data.budget != null
            ? String(data.budget)
            : ""
        );
        setBudgetTo(data.budgetTo != null ? String(data.budgetTo) : "");
        setDeadline(data.deadline || "");
        setUrgent(data.urgency === "urgent");
        setStatus(data.status || "active");
        setImages(
          (data.imageUrls || []).map((url, index) => ({
            id: `existing-${index}-${url}`,
            url,
            existing: true as const,
          }))
        );
      } catch (loadError) {
        console.error(loadError);
        setError("Не получилось загрузить заявку.");
      } finally {
        setPageLoading(false);
      }
    }

    loadRequest();
  }, [requestId]);

  useEffect(() => {
    if (ownerId && user?.uid && ownerId !== user.uid) {
      setError("У тебя нет доступа к редактированию этой заявки.");
    }
  }, [ownerId, user?.uid]);

  function handleImages(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || [])
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, Math.max(0, MAX_IMAGES - images.length));

    if (selected.some((file) => file.size > 10 * 1024 * 1024)) {
      setError("Одна из фотографий больше 10 МБ.");
      event.target.value = "";
      return;
    }

    const next = selected.map((file) => ({
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
      file,
      previewUrl: URL.createObjectURL(file),
      existing: false as const,
    }));

    setImages((current) => [...current, ...next].slice(0, MAX_IMAGES));
    setError("");
    event.target.value = "";
  }

  function removeImage(id: string) {
    setImages((current) => {
      const found = current.find((image) => image.id === id);
      if (found && isLocalImage(found)) URL.revokeObjectURL(found.previewUrl);
      return current.filter((image) => image.id !== id);
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (!user) {
      router.push("/auth");
      return;
    }

    if (ownerId && ownerId !== user.uid) {
      setError("У тебя нет доступа к редактированию этой заявки.");
      return;
    }

    if (title.trim().length < 5 || description.trim().length < 20 || city.trim().length < 2) {
      setError("Заполни название, подробное описание и город.");
      return;
    }

    const from = parseMoney(budgetFrom);
    const to = parseMoney(budgetTo);
    if (from && to && from > to) {
      setError("Бюджет «от» не может быть больше бюджета «до».");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const imageUrls = images
        .filter((image): image is ExistingImage => image.existing)
        .map((image) => image.url);

      for (const image of images.filter(isLocalImage)) {
        imageUrls.push(await uploadImage(image.file));
      }

      await updateDoc(doc(db, "customerRequests", requestId), {
        title: title.trim(),
        description: description.trim(),
        category,
        city: city.trim(),
        budget: from,
        budgetFrom: from,
        budgetTo: to,
        deadline: deadline.trim(),
        urgency: urgent ? "urgent" : "normal",
        status,
        imageUrls,
        updatedAt: serverTimestamp(),
      });

      images.forEach((image) => {
        if (isLocalImage(image)) URL.revokeObjectURL(image.previewUrl);
      });

      router.push(`/requests/${requestId}`);
    } catch (saveError) {
      console.error(saveError);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не получилось сохранить заявку."
      );
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || pageLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f7fb]">
        <Loader2 className="animate-spin text-[#0057ff]" size={38} />
      </main>
    );
  }

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
    <main className="min-h-screen bg-[#f5f7fb] px-5 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center gap-4">
          <Link href={`/requests/${requestId}`} className="icon-button">
            <ArrowLeft size={21} />
          </Link>
          <div>
            <p className="page-eyebrow">Редактирование</p>
            <h1 className="page-title">Изменить заявку</h1>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="mt-7 space-y-6 rounded-[34px] bg-white p-6 shadow-sm ring-1 ring-gray-100 md:p-8"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <label className="md:col-span-2">
              <span className="mb-2 block text-sm font-black text-gray-700">Название задачи</span>
              <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>

            <label>
              <span className="mb-2 block text-sm font-black text-gray-700">Категория</span>
              <select className="input bg-white" value={category} onChange={(event) => setCategory(event.target.value)}>
                {REQUEST_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>

            <label>
              <span className="mb-2 block text-sm font-black text-gray-700">Статус</span>
              <select className="input bg-white" value={status} onChange={(event) => setStatus(event.target.value as CustomerRequestStatus)}>
                <option value="active">Активна</option>
                <option value="closed">Закрыта</option>
              </select>
            </label>

            <label className="md:col-span-2">
              <span className="mb-2 block text-sm font-black text-gray-700">Описание</span>
              <textarea className="input min-h-40 resize-none" value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>

            <label>
              <span className="mb-2 block text-sm font-black text-gray-700">Город</span>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={19} />
                <input className="input pl-12" value={city} onChange={(event) => setCity(event.target.value)} />
              </div>
            </label>

            <label>
              <span className="mb-2 block text-sm font-black text-gray-700">Срок</span>
              <div className="relative">
                <CalendarDays className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={19} />
                <input className="input pl-12" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
              </div>
            </label>

            <label>
              <span className="mb-2 block text-sm font-black text-gray-700">Бюджет от, ₽</span>
              <input className="input" inputMode="numeric" value={budgetFrom} onChange={(event) => setBudgetFrom(event.target.value.replace(/\D/g, ""))} />
            </label>

            <label>
              <span className="mb-2 block text-sm font-black text-gray-700">Бюджет до, ₽</span>
              <input className="input" inputMode="numeric" value={budgetTo} onChange={(event) => setBudgetTo(event.target.value.replace(/\D/g, ""))} />
            </label>

            <label className="md:col-span-2 flex cursor-pointer items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4">
              <span>
                <span className="block font-black text-gray-950">Срочная заявка</span>
                <span className="mt-1 block text-sm text-gray-500">Пометка отображается на карточке и странице заявки.</span>
              </span>
              <input type="checkbox" checked={urgent} onChange={(event) => setUrgent(event.target.checked)} className="h-6 w-6 accent-[#0057ff]" />
            </label>
          </div>

          <section>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-gray-950">Фотографии</h2>
                <p className="mt-1 text-sm text-gray-500">До {MAX_IMAGES} фотографий.</p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-black text-[#0057ff] transition hover:bg-blue-100 active:scale-95">
                <ImagePlus size={19} />
                Добавить фото
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleImages} disabled={images.length >= MAX_IMAGES} />
              </label>
            </div>

            {images.length ? (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {images.map((image) => {
                  const url = image.existing ? image.url : image.previewUrl;
                  return (
                    <div key={image.id} className="relative aspect-square overflow-hidden rounded-2xl bg-gray-100">
                      <img src={url} alt="Фото заявки" className="h-full w-full object-cover" />
                      <button type="button" onClick={() => removeImage(image.id)} className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-xl bg-white/95 text-red-500 shadow-lg transition hover:scale-105">
                        <Trash2 size={17} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>

          {error ? <p className="rounded-2xl bg-red-50 p-4 text-sm font-black text-red-600">{error}</p> : null}

          <button disabled={saving || (!!ownerId && ownerId !== user.uid)} className="btn-primary w-full justify-center py-4 text-base disabled:opacity-60">
            {saving ? <Loader2 className="animate-spin" size={19} /> : <Save size={19} />}
            {saving ? "Сохраняем..." : "Сохранить изменения"}
          </button>
        </form>
      </div>
    </main>
  );
}
