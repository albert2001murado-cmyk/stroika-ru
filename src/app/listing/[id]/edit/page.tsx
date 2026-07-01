"use client";

import { useAuth } from "@/components/AuthProvider";
import { categories } from "@/data/categories";
import { db } from "@/lib/firebase";
import { getApiUrl } from "@/lib/getApiUrl";
import type { Listing, ListingMedia, PaymentMethod } from "@/types";
import {
  Banknote,
  Camera,
  Check,
  CreditCard,
  FileVideo,
  ImagePlus,
  Loader2,
  MapPin,
  Phone,
  Save,
  Trash2,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";

type LocalMediaFile = {
  id: string;
  file: File;
  type: "image" | "video";
  previewUrl: string;
};

const MAX_IMAGES = 15;
const MAX_VIDEOS = 3;

export default function EditListingPage() {
  const router = useRouter();
  const params = useParams();
  const listingId = String(params.id);

  const { user, loading } = useAuth();

  const [listing, setListing] = useState<Listing | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(categories[0].name);
  const [subcategory, setSubcategory] = useState(categories[0].subcategories[0]);
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [priceFrom, setPriceFrom] = useState("");

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([
    "cash",
  ]);

  const [existingMedia, setExistingMedia] = useState<ListingMedia[]>([]);
  const [newMediaFiles, setNewMediaFiles] = useState<LocalMediaFile[]>([]);

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadText, setUploadText] = useState("");

  const selectedCategory = useMemo(() => {
    return categories.find((item) => item.name === category);
  }, [category]);

  const imagesCount =
    existingMedia.filter((item) => item.type === "image").length +
    newMediaFiles.filter((item) => item.type === "image").length;

  const videosCount =
    existingMedia.filter((item) => item.type === "video").length +
    newMediaFiles.filter((item) => item.type === "video").length;

  useEffect(() => {
    async function loadListing() {
      try {
        const listingRef = doc(db, "listings", listingId);
        const snapshot = await getDoc(listingRef);

        if (!snapshot.exists()) {
          setError("Объявление не найдено.");
          setPageLoading(false);
          return;
        }

        const data = {
          id: snapshot.id,
          ...snapshot.data(),
        } as Listing;

        setListing(data);

        setTitle(data.title || "");
        setDescription(data.description || "");
        setCategory(data.category || categories[0].name);
        setSubcategory(data.subcategory || categories[0].subcategories[0]);
        setCity(data.city || "");
        setPhone(data.phone || "");
        setPriceFrom(data.priceFrom ? String(data.priceFrom) : "");
        setPaymentMethods(
          data.paymentMethods?.length ? data.paymentMethods : ["cash"]
        );
        setExistingMedia(data.media || []);
      } catch (err) {
        console.error(err);
        setError("Не получилось загрузить объявление.");
      } finally {
        setPageLoading(false);
      }
    }

    loadListing();
  }, [listingId]);

  useEffect(() => {
    if (!loading && user && listing && user.uid !== listing.authorId) {
      setError("Ты не можешь редактировать чужое объявление.");
    }
  }, [loading, user, listing]);

  function togglePayment(method: PaymentMethod) {
    setPaymentMethods((current) => {
      if (current.includes(method)) {
        const next = current.filter((item) => item !== method);
        return next.length ? next : current;
      }

      return [...current, method];
    });
  }

  function handleMediaChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    setError("");

    const nextFiles: LocalMediaFile[] = [];

    for (const file of files) {
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");

      if (!isImage && !isVideo) {
        setError("Можно загружать только фото и видео.");
        continue;
      }

      const currentImages =
        imagesCount + nextFiles.filter((item) => item.type === "image").length;

      const currentVideos =
        videosCount + nextFiles.filter((item) => item.type === "video").length;

      if (isImage && currentImages >= MAX_IMAGES) {
        setError(`Максимум ${MAX_IMAGES} фото.`);
        continue;
      }

      if (isVideo && currentVideos >= MAX_VIDEOS) {
        setError(`Максимум ${MAX_VIDEOS} видео.`);
        continue;
      }

      nextFiles.push({
        id: crypto.randomUUID(),
        file,
        type: isImage ? "image" : "video",
        previewUrl: URL.createObjectURL(file),
      });
    }

    setNewMediaFiles((current) => [...current, ...nextFiles]);
    e.target.value = "";
  }

  function removeExistingMedia(url: string) {
    setExistingMedia((current) => current.filter((item) => item.url !== url));
  }

  function removeNewMedia(id: string) {
    setNewMediaFiles((current) => {
      const found = current.find((item) => item.id === id);

      if (found) {
        URL.revokeObjectURL(found.previewUrl);
      }

      return current.filter((item) => item.id !== id);
    });
  }

  async function uploadOneFile(item: LocalMediaFile): Promise<ListingMedia> {
    const formData = new FormData();
    formData.append("file", item.file);

    const response = await fetch(getApiUrl("/api/upload"), {
      method: "POST",
      body: formData,
    });

    const text = await response.text();

    let data;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(
        "API /api/upload не вернул JSON. Проверь src/app/api/upload/route.ts"
      );
    }

    if (!response.ok) {
      throw new Error(data?.error || "Ошибка загрузки файла.");
    }

    return data as ListingMedia;
  }

  async function uploadNewMediaFiles(): Promise<ListingMedia[]> {
    const uploaded: ListingMedia[] = [];

    for (let i = 0; i < newMediaFiles.length; i++) {
      setUploadText(`Загружаем новые файлы: ${i + 1} из ${newMediaFiles.length}`);

      const uploadedFile = await uploadOneFile(newMediaFiles[i]);
      uploaded.push(uploadedFile);
    }

    return uploaded;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!user) {
      router.push("/auth");
      return;
    }

    if (!listing) {
      setError("Объявление не найдено.");
      return;
    }

    if (user.uid !== listing.authorId) {
      setError("Ты не можешь редактировать чужое объявление.");
      return;
    }

    if (!title.trim()) {
      setError("Укажи название услуги.");
      return;
    }

    if (!description.trim()) {
      setError("Добавь описание услуги.");
      return;
    }

    if (!city.trim()) {
      setError("Укажи город.");
      return;
    }

    if (!phone.trim()) {
      setError("Укажи телефон.");
      return;
    }

    setSaving(true);

    try {
      const uploadedNewMedia = await uploadNewMediaFiles();
      const finalMedia = [...existingMedia, ...uploadedNewMedia];

      const imageUrls = finalMedia
        .filter((item) => item.type === "image")
        .map((item) => item.url);

      const videoUrls = finalMedia
        .filter((item) => item.type === "video")
        .map((item) => item.url);

      await updateDoc(doc(db, "listings", listingId), {
        title: title.trim(),
        description: description.trim(),
        category,
        subcategory,
        city: city.trim(),
        phone: phone.trim(),
        priceFrom: priceFrom ? Number(priceFrom) : null,

        paymentMethods,
        media: finalMedia,
        imageUrls,
        videoUrls,

        updatedAt: serverTimestamp(),
      });

      router.push(`/listing/${listingId}`);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Ошибка сохранения.");
    } finally {
      setSaving(false);
      setUploadText("");
    }
  }

  if (loading || pageLoading) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-5 py-10">
        Загрузка...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-5 py-10">
        <div className="mx-auto max-w-xl rounded-[30px] bg-white p-8 text-center shadow-xl">
          <h1 className="text-3xl font-black text-gray-950">
            Сначала войди в аккаунт
          </h1>

          <p className="mt-3 text-gray-500">
            Редактировать объявления могут только владельцы.
          </p>

          <button
            type="button"
            onClick={() => router.push("/auth")}
            className="btn-primary mt-6"
          >
            Войти
          </button>
        </div>
      </main>
    );
  }

  if (listing && user.uid !== listing.authorId) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-5 py-10">
        <div className="mx-auto max-w-xl rounded-[30px] bg-white p-8 text-center shadow-xl">
          <h1 className="text-3xl font-black text-red-600">Нет доступа</h1>

          <p className="mt-3 text-gray-500">
            Это объявление принадлежит другому пользователю.
          </p>

          <button
            type="button"
            onClick={() => router.push(`/listing/${listingId}`)}
            className="btn-primary mt-6"
          >
            Вернуться к объявлению
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-5 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 rounded-[34px] bg-[#0057ff] p-8 text-white">
          <p className="font-black text-[#ffd233]">Стройка.ру</p>

          <h1 className="mt-3 text-4xl font-black">
            Редактировать объявление
          </h1>

          <p className="mt-3 text-blue-50">
            Измени описание, цену, фото, видео и способы оплаты.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid gap-6 lg:grid-cols-[1fr_340px]"
        >
          <section className="space-y-6">
            <div className="rounded-[30px] bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-black text-gray-950">
                Основная информация
              </h2>

              <div className="mt-6 space-y-4">
                <input
                  className="input"
                  placeholder="Название услуги"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />

                <textarea
                  className="input min-h-40 resize-none"
                  placeholder="Описание услуги"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <select
                    className="input bg-white font-bold text-gray-950"
                    value={category}
                    onChange={(e) => {
                      const newCategory = e.target.value;
                      const found = categories.find(
                        (item) => item.name === newCategory
                      );

                      setCategory(newCategory);
                      setSubcategory(found?.subcategories[0] || "");
                    }}
                  >
                    {categories.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </select>

                  <select
                    className="input bg-white font-bold text-gray-950"
                    value={subcategory}
                    onChange={(e) => setSubcategory(e.target.value)}
                  >
                    {selectedCategory?.subcategories.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="relative">
                    <MapPin
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                      size={20}
                    />

                    <input
                      className="input"
                      style={{ paddingLeft: "58px" }}
                      placeholder="Город"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </div>

                  <div className="relative">
                    <Phone
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                      size={20}
                    />

                    <input
                      className="input"
                      style={{ paddingLeft: "58px" }}
                      placeholder="Телефон"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-gray-950">
                    Фото и видео
                  </h2>

                  <p className="mt-2 text-gray-500">
                    Можно удалить старые файлы и добавить новые.
                  </p>
                </div>

                <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-[#0057ff] px-5 py-3 font-black text-white">
                  <ImagePlus size={20} />
                  Добавить
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={handleMediaChange}
                  />
                </label>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="flex items-center gap-3 rounded-2xl bg-blue-50 p-4">
                  <Camera className="text-[#0057ff]" />
                  <b>
                    Фото: {imagesCount}/{MAX_IMAGES}
                  </b>
                </div>

                <div className="flex items-center gap-3 rounded-2xl bg-blue-50 p-4">
                  <FileVideo className="text-[#0057ff]" />
                  <b>
                    Видео: {videosCount}/{MAX_VIDEOS}
                  </b>
                </div>
              </div>

              {(existingMedia.length > 0 || newMediaFiles.length > 0) && (
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {existingMedia.map((item) => (
                    <div
                      key={item.url}
                      className="relative overflow-hidden rounded-3xl border border-gray-200 bg-gray-50"
                    >
                      {item.type === "image" ? (
                        <img
                          src={item.url}
                          alt={item.name}
                          className="h-48 w-full object-cover"
                        />
                      ) : (
                        <video
                          src={item.url}
                          className="h-48 w-full object-cover"
                          controls
                        />
                      )}

                      <button
                        type="button"
                        onClick={() => removeExistingMedia(item.url)}
                        className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-red-500 shadow-lg"
                      >
                        <Trash2 size={18} />
                      </button>

                      <p className="truncate p-3 text-sm font-bold text-gray-700">
                        {item.name || "Файл объявления"}
                      </p>
                    </div>
                  ))}

                  {newMediaFiles.map((item) => (
                    <div
                      key={item.id}
                      className="relative overflow-hidden rounded-3xl border border-blue-200 bg-blue-50"
                    >
                      {item.type === "image" ? (
                        <img
                          src={item.previewUrl}
                          alt={item.file.name}
                          className="h-48 w-full object-cover"
                        />
                      ) : (
                        <video
                          src={item.previewUrl}
                          className="h-48 w-full object-cover"
                          controls
                        />
                      )}

                      <button
                        type="button"
                        onClick={() => removeNewMedia(item.id)}
                        className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-red-500 shadow-lg"
                      >
                        <Trash2 size={18} />
                      </button>

                      <p className="truncate p-3 text-sm font-bold text-[#0057ff]">
                        Новый файл: {item.file.name}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-[30px] bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-black text-gray-950">
                Цена и оплата
              </h2>

              <input
                className="input mt-6"
                placeholder="Цена от, ₽"
                type="number"
                value={priceFrom}
                onChange={(e) => setPriceFrom(e.target.value)}
              />

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => togglePayment("cash")}
                  className={`flex items-center justify-between rounded-3xl border p-5 font-black ${
                    paymentMethods.includes("cash")
                      ? "border-[#0057ff] bg-blue-50 text-[#0057ff]"
                      : "border-gray-200 bg-white text-gray-700"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Banknote />
                    Наличными
                  </span>

                  {paymentMethods.includes("cash") && <Check />}
                </button>

                <button
                  type="button"
                  onClick={() => togglePayment("transfer")}
                  className={`flex items-center justify-between rounded-3xl border p-5 font-black ${
                    paymentMethods.includes("transfer")
                      ? "border-[#0057ff] bg-blue-50 text-[#0057ff]"
                      : "border-gray-200 bg-white text-gray-700"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <CreditCard />
                    Переводом
                  </span>

                  {paymentMethods.includes("transfer") && <Check />}
                </button>
              </div>
            </div>
          </section>

          <aside className="h-fit rounded-[30px] bg-white p-6 shadow-sm lg:sticky lg:top-24">
            <h2 className="text-2xl font-black text-gray-950">Сохранение</h2>

            <div className="mt-5 space-y-3 text-sm text-gray-600">
              <div className="flex justify-between rounded-2xl bg-gray-50 p-3">
                <span>Фото</span>
                <b>{imagesCount}</b>
              </div>

              <div className="flex justify-between rounded-2xl bg-gray-50 p-3">
                <span>Видео</span>
                <b>{videosCount}</b>
              </div>

              <div className="flex justify-between rounded-2xl bg-gray-50 p-3">
                <span>Оплата</span>
                <b>
                  {paymentMethods.includes("cash") &&
                  paymentMethods.includes("transfer")
                    ? "Нал. + перевод"
                    : paymentMethods.includes("cash")
                    ? "Наличные"
                    : "Перевод"}
                </b>
              </div>
            </div>

            {error && (
              <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-black text-red-600">
                {error}
              </p>
            )}

            {uploadText && (
              <p className="mt-5 rounded-2xl bg-blue-50 p-4 text-sm font-black text-[#0057ff]">
                {uploadText}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0057ff] px-5 py-4 text-lg font-black text-white disabled:opacity-70"
            >
              {saving ? (
                <>
                  <Loader2 className="animate-spin" size={22} />
                  Сохраняем...
                </>
              ) : (
                <>
                  <Save size={22} />
                  Сохранить изменения
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => router.push(`/listing/${listingId}`)}
              className="mt-3 w-full rounded-2xl bg-gray-100 px-5 py-4 font-black text-gray-700"
            >
              Отмена
            </button>
          </aside>
        </form>
      </div>
    </main>
  );
}
