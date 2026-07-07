"use client";

import { useAuth } from "@/components/AuthProvider";
import { categories } from "@/data/categories";
import { db } from "@/lib/firebase";
import { getApiUrl } from "@/lib/getApiUrl";
import type { ListingMedia, PaymentMethod } from "@/types";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import {
  ArrowLeft,
  Banknote,
  Camera,
  CreditCard,
  Loader2,
  MapPin,
  Phone,
  Plus,
  Send,
  Trash2,
  Video,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";

type LocalMediaFile = {
  id: string;
  file: File;
  type: "image" | "video";
  previewUrl: string;
};

const MAX_IMAGES = 15;
const MAX_VIDEOS = 3;

function createLocalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getFileType(file: File): "image" | "video" | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";

  return null;
}

async function uploadOneFile(item: LocalMediaFile): Promise<ListingMedia> {
  const formData = new FormData();
  formData.append("file", item.file);

  const response = await fetch(getApiUrl("/api/upload"), {
    method: "POST",
    body: formData,
  });

  const text = await response.text();

  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      "API /api/upload не вернул JSON. Проверь src/app/api/upload/route.ts"
    );
  }

  if (!response.ok) {
    throw new Error(data?.error || "Не получилось загрузить файл.");
  }

  if (!data?.url) {
    throw new Error("API /api/upload не вернул ссылку на файл.");
  }

  return data as ListingMedia;
}

type GeocodeResult = {
  lat: number;
  lng: number;
  address: string;
};

async function geocodeAddress(
  city: string,
  address?: string
): Promise<GeocodeResult | null> {
  const fullAddress = [city, address]
    .map((item) => item?.trim())
    .filter(Boolean)
    .join(", ");

  if (!fullAddress) {
    return null;
  }

  try {
    const response = await fetch(
      getApiUrl(`/api/geocode?address=${encodeURIComponent(fullAddress)}`)
    );

    const data = await response.json();

    if (!response.ok) {
      console.warn("Не удалось определить координаты:", data?.error);
      return null;
    }

    if (
      typeof data?.lat !== "number" ||
      typeof data?.lng !== "number" ||
      !Number.isFinite(data.lat) ||
      !Number.isFinite(data.lng)
    ) {
      console.warn("Геокодер вернул некорректные координаты:", data);
      return null;
    }

    return {
      lat: data.lat,
      lng: data.lng,
      address: data.address || fullAddress,
    };
  } catch (error) {
    console.warn("Ошибка геокодинга:", error);
    return null;
  }
}

export default function NewListingPage() {
  const router = useRouter();
  const { user, profile } = useAuth();

  const firstCategory = categories[0]?.name || "";
  const firstSubcategory = categories[0]?.subcategories?.[0] || "";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(firstCategory);
  const [subcategory, setSubcategory] = useState(firstSubcategory);
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [priceFrom, setPriceFrom] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([
    "cash",
  ]);

  const [mediaFiles, setMediaFiles] = useState<LocalMediaFile[]>([]);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const selectedCategory = useMemo(
    () => categories.find((item) => item.name === category),
    [category]
  );

  const imageCount = mediaFiles.filter((item) => item.type === "image").length;
  const videoCount = mediaFiles.filter((item) => item.type === "video").length;

  function handleCategoryChange(value: string) {
    const nextCategory = categories.find((item) => item.name === value);

    setCategory(value);
    setSubcategory(nextCategory?.subcategories?.[0] || "");
  }

  function togglePaymentMethod(method: PaymentMethod) {
    setPaymentMethods((current) => {
      if (current.includes(method)) {
        const next = current.filter((item) => item !== method);

        return next.length ? next : current;
      }

      return [...current, method];
    });
  }

  function handleMediaSelect(event: ChangeEvent<HTMLInputElement>) {
    setError("");

    const files = Array.from(event.target.files || []);

    if (!files.length) {
      return;
    }

    const preparedFiles: LocalMediaFile[] = [];

    let nextImageCount = imageCount;
    let nextVideoCount = videoCount;

    for (const file of files) {
      const fileType = getFileType(file);

      if (!fileType) {
        setError("Можно добавлять только фото и видео.");
        continue;
      }

      if (fileType === "image" && nextImageCount >= MAX_IMAGES) {
        setError(`Можно добавить максимум ${MAX_IMAGES} фото.`);
        continue;
      }

      if (fileType === "video" && nextVideoCount >= MAX_VIDEOS) {
        setError(`Можно добавить максимум ${MAX_VIDEOS} видео.`);
        continue;
      }

      if (fileType === "image" && file.size > 10 * 1024 * 1024) {
        setError("Фото слишком большое. Максимум 10 МБ.");
        continue;
      }

      if (fileType === "video" && file.size > 80 * 1024 * 1024) {
        setError("Видео слишком большое. Максимум 80 МБ.");
        continue;
      }

      preparedFiles.push({
        id: createLocalId(),
        file,
        type: fileType,
        previewUrl: URL.createObjectURL(file),
      });

      if (fileType === "image") nextImageCount += 1;
      if (fileType === "video") nextVideoCount += 1;
    }

    if (preparedFiles.length) {
      setMediaFiles((current) => [...current, ...preparedFiles]);
    }

    event.target.value = "";
  }

  function removeMediaFile(id: string) {
    setMediaFiles((current) => {
      const found = current.find((item) => item.id === id);

      if (found) {
        URL.revokeObjectURL(found.previewUrl);
      }

      return current.filter((item) => item.id !== id);
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) {
      router.push("/auth");
      return;
    }

    if (!title.trim() || !description.trim() || !category || !subcategory) {
      setError("Заполни название, описание, категорию и подкатегорию.");
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

    setIsSaving(true);
    setError("");

    try {
      const uploadedMedia: ListingMedia[] = [];

      for (const item of mediaFiles) {
        const uploaded = await uploadOneFile(item);
        uploadedMedia.push(uploaded);
      }

      const imageUrls = uploadedMedia
        .filter((item) => item.type === "image")
        .map((item) => item.url);

      const videoUrls = uploadedMedia
        .filter((item) => item.type === "video")
        .map((item) => item.url);

      const geo = await geocodeAddress(city.trim(), address.trim());

      const listingRef = await addDoc(collection(db, "listings"), {
        title: title.trim(),
        description: description.trim(),
        category,
        subcategory,
        city: city.trim(),
        address: address.trim(),

        location: geo
          ? {
              lat: geo.lat,
              lng: geo.lng,
              address: geo.address,
            }
          : null,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        geocodedAddress: geo?.address ?? "",

        phone: phone.trim(),
        priceFrom: priceFrom.trim() ? Number(priceFrom) : null,
        paymentMethods,

        media: uploadedMedia,
        imageUrls,
        videoUrls,

        authorId: user.uid,
        authorName:
          profile?.displayName || user.displayName || user.email || "Пользователь",
        authorAvatarUrl: profile?.avatarUrl || user.photoURL || "",
        accountType: profile?.accountType || "individual",

        viewsCount: 0,
        favoritesCount: 0,

        createdAt: serverTimestamp(),
      });

      router.push(`/listing/${listingRef.id}`);
    } catch (uploadError) {
      console.error(uploadError);

      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Не получилось разместить объявление."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-5 py-10">
      <div className="mx-auto max-w-7xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-[#0057ff] shadow-sm"
        >
          <ArrowLeft size={18} />
          Назад
        </Link>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <form
            onSubmit={handleSubmit}
            className="rounded-[36px] bg-white p-6 shadow-sm ring-1 ring-gray-100 md:p-8"
          >
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#0057ff]">
                Новая анкета
              </p>

              <h1 className="mt-3 text-4xl font-black text-gray-950">
                Разместить услугу
              </h1>

              <p className="mt-3 text-gray-500">
                Фото появляется сразу после выбора. На сервер загружается после
                кнопки “Разместить”.
              </p>
            </div>

            {error && (
              <div className="mt-6 rounded-2xl bg-red-50 px-5 py-4 font-bold text-red-700">
                {error}
              </div>
            )}

            <section className="mt-8 grid gap-5">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Название услуги"
                className="input"
              />

              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Описание услуги"
                className="input min-h-40 resize-none"
              />

              <div className="grid gap-5 md:grid-cols-2">
                <select
                  value={category}
                  onChange={(event) => handleCategoryChange(event.target.value)}
                  className="input"
                >
                  {categories.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>

                <select
                  value={subcategory}
                  onChange={(event) => setSubcategory(event.target.value)}
                  className="input"
                >
                  {(selectedCategory?.subcategories || []).map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>

                <div className="relative">
                  <MapPin
                    size={19}
                    className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    placeholder="Город"
                    className="input"
                    style={{ paddingLeft: "52px" }}
                  />
                </div>

                <div className="relative">
                  <MapPin
                    size={19}
                    className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder="Адрес, деревня, улица или объект"
                    className="input"
                    style={{ paddingLeft: "52px" }}
                  />
                </div>

                <div className="relative">
                  <Phone
                    size={19}
                    className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="Телефон"
                    className="input"
                    style={{ paddingLeft: "52px" }}
                  />
                </div>
              </div>
            </section>

            <section className="mt-8 rounded-[28px] border border-gray-100 bg-gray-50 p-5">
              <h2 className="text-2xl font-black text-gray-950">Фото и видео</h2>

              <p className="mt-2 text-sm font-medium text-gray-500">
                Фото выбирается сразу и должно появиться ниже. Если фото не
                появилось — значит браузер не передал файл в форму.
              </p>

              <input
                id="listing-media-input"
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleMediaSelect}
                className="hidden"
              />

              <label
                htmlFor="listing-media-input"
                className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-[#0057ff] px-5 py-3 font-black text-white shadow-lg shadow-blue-500/20 transition hover:-translate-y-0.5"
              >
                <Plus size={18} />
                Добавить фото/видео
              </label>

              <div className="mt-5 flex flex-wrap gap-4 text-sm font-black text-gray-500">
                <span className="inline-flex items-center gap-2">
                  <Camera size={17} className="text-[#0057ff]" />
                  Фото: {imageCount}/{MAX_IMAGES}
                </span>

                <span className="inline-flex items-center gap-2">
                  <Video size={17} className="text-[#0057ff]" />
                  Видео: {videoCount}/{MAX_VIDEOS}
                </span>
              </div>

              {mediaFiles.length > 0 && (
                <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
                  {mediaFiles.map((item) => (
                    <div
                      key={item.id}
                      className="relative overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-gray-100"
                    >
                      {item.type === "image" ? (
                        <img
                          src={item.previewUrl}
                          alt="Фото объявления"
                          className="h-36 w-full object-cover"
                        />
                      ) : (
                        <video
                          src={item.previewUrl}
                          className="h-36 w-full object-cover"
                          controls
                        />
                      )}

                      <button
                        type="button"
                        onClick={() => removeMediaFile(item.id)}
                        className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-white shadow-lg"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-8 rounded-[28px] border border-gray-100 bg-white p-5">
              <h2 className="text-2xl font-black text-gray-950">Цена и оплата</h2>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <input
                  value={priceFrom}
                  onChange={(event) => setPriceFrom(event.target.value)}
                  type="number"
                  min="0"
                  placeholder="Цена от, ₽"
                  className="input"
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => togglePaymentMethod("cash")}
                    className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-4 font-black ${
                      paymentMethods.includes("cash")
                        ? "border-[#0057ff] bg-blue-50 text-[#0057ff]"
                        : "border-gray-200 bg-white text-gray-500"
                    }`}
                  >
                    <Banknote size={18} />
                    Наличными
                  </button>

                  <button
                    type="button"
                    onClick={() => togglePaymentMethod("transfer")}
                    className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-4 font-black ${
                      paymentMethods.includes("transfer")
                        ? "border-[#0057ff] bg-blue-50 text-[#0057ff]"
                        : "border-gray-200 bg-white text-gray-500"
                    }`}
                  >
                    <CreditCard size={18} />
                    Переводом
                  </button>
                </div>
              </div>
            </section>

            <button
              type="submit"
              disabled={isSaving}
              className="mt-8 flex w-full items-center justify-center gap-3 rounded-3xl bg-[#0057ff] px-6 py-5 text-lg font-black text-white shadow-xl shadow-blue-500/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? (
                <>
                  <Loader2 size={22} className="animate-spin" />
                  Загружаем и размещаем...
                </>
              ) : (
                <>
                  <Send size={22} />
                  Разместить
                </>
              )}
            </button>
          </form>

          <aside className="h-fit rounded-[36px] bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-2xl font-black text-gray-950">Публикация</h2>

            <div className="mt-6 space-y-4 text-sm font-bold text-gray-500">
              <div className="flex items-center justify-between">
                <span>Фото</span>
                <span className="text-gray-950">{imageCount}/{MAX_IMAGES}</span>
              </div>

              <div className="flex items-center justify-between">
                <span>Видео</span>
                <span className="text-gray-950">{videoCount}/{MAX_VIDEOS}</span>
              </div>

              <div className="flex items-center justify-between">
                <span>Оплата</span>
                <span className="text-gray-950">
                  {paymentMethods.includes("cash") &&
                  paymentMethods.includes("transfer")
                    ? "Наличные / перевод"
                    : paymentMethods.includes("transfer")
                    ? "Перевод"
                    : "Наличные"}
                </span>
              </div>
            </div>

            <div className="mt-6 rounded-3xl bg-blue-50 p-5 text-sm font-bold leading-6 text-[#0057ff]">
             
            </div>

            {mediaFiles.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  mediaFiles.forEach((item) =>
                    URL.revokeObjectURL(item.previewUrl)
                  );
                  setMediaFiles([]);
                }}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 px-5 py-3 font-black text-red-600"
              >
                <Trash2 size={18} />
                Очистить фото
              </button>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
