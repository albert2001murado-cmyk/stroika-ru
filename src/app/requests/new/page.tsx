"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import {
  ArrowLeft,
  CalendarDays,
  ImagePlus,
  Loader2,
  MapPin,
  Send,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

type LocalImage = {
  id: string;
  file: File;
  previewUrl: string;
};

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

export default function NewRequestPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(REQUEST_CATEGORIES[0]);
  const [city, setCity] = useState("");
  const [budgetFrom, setBudgetFrom] = useState("");
  const [budgetTo, setBudgetTo] = useState("");
  const [deadline, setDeadline] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [images, setImages] = useState<LocalImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!city && profile?.city) setCity(profile.city);
  }, [city, profile?.city]);

  function handleImages(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || [])
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, Math.max(0, MAX_IMAGES - images.length));

    const tooLarge = selected.find((file) => file.size > 10 * 1024 * 1024);
    if (tooLarge) {
      setError("Одна из фотографий больше 10 МБ.");
      event.target.value = "";
      return;
    }

    setImages((current) => [
      ...current,
      ...selected.map((file) => ({
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ].slice(0, MAX_IMAGES));

    setError("");
    event.target.value = "";
  }

  function removeImage(id: string) {
    setImages((current) => {
      const found = current.find((item) => item.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;

    if (title.trim().length < 5) {
      setError("Название должно быть не короче 5 символов.");
      return;
    }

    if (description.trim().length < 20) {
      setError("Опиши задачу подробнее — минимум 20 символов.");
      return;
    }

    if (city.trim().length < 2) {
      setError("Укажи город.");
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
      const imageUrls: string[] = [];
      for (const image of images) {
        imageUrls.push(await uploadImage(image.file));
      }

      const customerName =
        profile?.displayName ||
        profile?.name ||
        user.displayName ||
        user.email?.split("@")[0] ||
        "Заказчик";

      const customerAvatar =
        profile?.avatarUrl || profile?.photoURL || user.photoURL || "";

      const customerPhone =
        typeof profile?.phone === "string" ? profile.phone.trim() : "";

      const reference = await addDoc(collection(db, "customerRequests"), {
        customerId: user.uid,
        customerName,
        customerAvatar,
        customerPhone,
        title: title.trim(),
        description: description.trim(),
        category,
        city: city.trim(),
        budget: from,
        budgetFrom: from,
        budgetTo: to,
        deadline: deadline.trim(),
        urgency: urgent ? "urgent" : "normal",
        status: "active",
        imageUrls,
        offersCount: 0,
        viewsCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      router.push(`/requests/${reference.id}`);
    } catch (submitError) {
      console.error(submitError);
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Не получилось создать заявку."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="app-page">Загрузка...</main>;

  if (!user) {
    return (
      <main className="app-page">
        <div className="empty-card">
          <h1>Сначала войди в аккаунт</h1>
          <Link href="/auth" className="btn-primary mt-5">
            Войти
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-5 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center gap-4">
          <Link href="/requests" className="icon-button">
            <ArrowLeft size={21} />
          </Link>
          <div>
            <p className="page-eyebrow">Новая заявка заказчика</p>
            <h1 className="page-title">Что нужно сделать?</h1>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="mt-7 space-y-6 rounded-[34px] bg-white p-6 shadow-sm ring-1 ring-gray-100 md:p-8"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <label className="md:col-span-2">
              <span className="mb-2 block text-sm font-black text-gray-700">
                Название задачи
              </span>
              <input
                className="input"
                placeholder="Например: выполнить ремонт ванной"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>

            <label>
              <span className="mb-2 block text-sm font-black text-gray-700">
                Категория
              </span>
              <select
                className="input bg-white"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {REQUEST_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-2 block text-sm font-black text-gray-700">
                Город
              </span>
              <div className="relative">
                <MapPin
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                  size={19}
                />
                <input
                  className="input pl-12"
                  placeholder="Нижний Новгород"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                />
              </div>
            </label>

            <label className="md:col-span-2">
              <span className="mb-2 block text-sm font-black text-gray-700">
                Описание
              </span>
              <textarea
                className="input min-h-40 resize-none"
                placeholder="Опиши объём, пожелания, материалы и важные детали"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <label>
              <span className="mb-2 block text-sm font-black text-gray-700">
                Бюджет от, ₽
              </span>
              <input
                className="input"
                inputMode="numeric"
                placeholder="15000"
                value={budgetFrom}
                onChange={(event) =>
                  setBudgetFrom(event.target.value.replace(/\D/g, ""))
                }
              />
            </label>

            <label>
              <span className="mb-2 block text-sm font-black text-gray-700">
                Бюджет до, ₽
              </span>
              <input
                className="input"
                inputMode="numeric"
                placeholder="60000"
                value={budgetTo}
                onChange={(event) =>
                  setBudgetTo(event.target.value.replace(/\D/g, ""))
                }
              />
            </label>

            <label>
              <span className="mb-2 block text-sm font-black text-gray-700">
                Срок выполнения
              </span>
              <div className="relative">
                <CalendarDays
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                  size={19}
                />
                <input
                  className="input pl-12"
                  placeholder="Например: до 27 ноября"
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                />
              </div>
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4">
              <span>
                <span className="block font-black text-gray-950">Срочная заявка</span>
                <span className="mt-1 block text-sm text-gray-500">
                  Покажем исполнителям, что ответ нужен быстрее.
                </span>
              </span>
              <input
                type="checkbox"
                checked={urgent}
                onChange={(event) => setUrgent(event.target.checked)}
                className="h-6 w-6 accent-[#0057ff]"
              />
            </label>
          </div>

          <section>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-gray-950">Фотографии</h2>
                <p className="mt-1 text-sm text-gray-500">
                  До {MAX_IMAGES} фото. Они будут видны и на сайте, и в мобильном приложении.
                </p>
              </div>

              <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-black text-[#0057ff] transition hover:bg-blue-100 active:scale-95">
                <ImagePlus size={19} />
                Добавить фото
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImages}
                  disabled={images.length >= MAX_IMAGES}
                />
              </label>
            </div>

            {images.length ? (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {images.map((image) => (
                  <div
                    key={image.id}
                    className="group relative aspect-square overflow-hidden rounded-2xl bg-gray-100"
                  >
                    <img
                      src={image.previewUrl}
                      alt="Фото заявки"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(image.id)}
                      className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-xl bg-white/95 text-red-500 shadow-lg transition hover:scale-105"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          {error ? (
            <p className="rounded-2xl bg-red-50 p-4 text-sm font-black text-red-600">
              {error}
            </p>
          ) : null}

          <button
            disabled={saving}
            className="btn-primary w-full justify-center py-4 text-base disabled:opacity-70"
          >
            {saving ? <Loader2 className="animate-spin" size={19} /> : <Send size={19} />}
            {saving ? "Публикуем..." : "Опубликовать заявку"}
          </button>
        </form>
      </div>
    </main>
  );
}
