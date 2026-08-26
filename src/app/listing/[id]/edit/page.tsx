"use client";

import { useAuth } from "@/components/AuthProvider";
import { categories } from "@/data/categories";
import { db } from "@/lib/firebase";
import { getApiUrl } from "@/lib/getApiUrl";
import {
  buildListingSearchTags,
  getOfferActions,
  getOfferFeatures,
  getOfferGroup,
  getOfferGroupInfo,
  inferOfferFromLegacy,
  legacyCapabilitiesFromOffer,
} from "@/lib/listingOffer";
import type { ListingMedia, PaymentMethod } from "@/types";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import {
  ArrowLeft,
  Banknote,
  Camera,
  Check,
  CreditCard,
  Loader2,
  MapPin,
  Phone,
  Plus,
  Save,
  Trash2,
  Video,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

type LocalMediaFile = {
  id: string;
  file: File;
  type: "image" | "video";
  previewUrl: string;
  isExisting?: false;
};

type ExistingMediaFile = ListingMedia & {
  id: string;
  isExisting: true;
};

type MediaItem = LocalMediaFile | ExistingMediaFile;

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

function isExistingMedia(item: MediaItem): item is ExistingMediaFile {
  return item.isExisting === true;
}

function isLocalMedia(item: MediaItem): item is LocalMediaFile {
  return item.isExisting !== true;
}

function normalizeExistingMedia(data: any): ExistingMediaFile[] {
  const result: ExistingMediaFile[] = [];
  const usedUrls = new Set<string>();

  if (Array.isArray(data?.media)) {
    data.media.forEach((item: ListingMedia, index: number) => {
      if (!item?.url || !item?.type) return;

      usedUrls.add(item.url);

      result.push({
        id: item.path || item.url || `existing-media-${index}`,
        type: item.type,
        url: item.url,
        path: item.path || "",
        name: item.name || (item.type === "image" ? "Фото" : "Видео"),
        size: item.size,
        isExisting: true,
      });
    });
  }

  if (Array.isArray(data?.imageUrls)) {
    data.imageUrls.forEach((url: string, index: number) => {
      if (!url || usedUrls.has(url)) return;

      usedUrls.add(url);

      result.push({
        id: `existing-image-${index}-${url}`,
        type: "image",
        url,
        path: "",
        name: "Фото",
        isExisting: true,
      });
    });
  }

  if (Array.isArray(data?.videoUrls)) {
    data.videoUrls.forEach((url: string, index: number) => {
      if (!url || usedUrls.has(url)) return;

      usedUrls.add(url);

      result.push({
        id: `existing-video-${index}-${url}`,
        type: "video",
        url,
        path: "",
        name: "Видео",
        isExisting: true,
      });
    });
  }

  return result;
}

function existingMediaToListingMedia(item: ExistingMediaFile): ListingMedia {
  return {
    type: item.type,
    url: item.url,
    path: item.path || "",
    name: item.name || (item.type === "image" ? "Фото" : "Видео"),
    size: item.size,
  };
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

export default function EditListingPage() {
  const router = useRouter();
  const params = useParams();
  const { user } = useAuth();

  const listingId =
    typeof params?.id === "string"
      ? params.id
      : Array.isArray(params?.id)
      ? params.id[0]
      : "";

  const firstCategory = categories[0]?.name || "";
  const firstSubcategory = categories[0]?.subcategories?.[0] || "";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(firstCategory);
  const [subcategory, setSubcategory] = useState(firstSubcategory);
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [priceFrom, setPriceFrom] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(["cash"]);
  const initialOfferGroup = getOfferGroup(firstCategory);
  const [offerAction, setOfferAction] = useState(
    getOfferActions(initialOfferGroup)[0]?.id || ""
  );
  const [offerFeatures, setOfferFeatures] = useState<Record<string, boolean>>({});

  const [mediaFiles, setMediaFiles] = useState<MediaItem[]>([]);
  const [authorId, setAuthorId] = useState("");
  const [originalCategory, setOriginalCategory] = useState("");
  const [originalSubcategory, setOriginalSubcategory] = useState("");

  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const selectedCategory = useMemo(
    () => categories.find((item) => item.name === category),
    [category]
  );
  const offerGroup = useMemo(() => getOfferGroup(category), [category]);
  const offerGroupInfo = useMemo(
    () => getOfferGroupInfo(offerGroup),
    [offerGroup]
  );
  const offerActions = useMemo(
    () => getOfferActions(offerGroup),
    [offerGroup]
  );
  const offerFeatureOptions = useMemo(
    () => getOfferFeatures(offerGroup),
    [offerGroup]
  );
  const selectedOfferAction = useMemo(
    () => offerActions.find((item) => item.id === offerAction),
    [offerAction, offerActions]
  );

  const imageCount = mediaFiles.filter((item) => item.type === "image").length;
  const videoCount = mediaFiles.filter((item) => item.type === "video").length;

  useEffect(() => {
    async function loadListing() {
      if (!listingId) {
        setError("Объявление не найдено.");
        setIsLoading(false);
        return;
      }

      try {
        const listingSnap = await getDoc(doc(db, "listings", listingId));

        if (!listingSnap.exists()) {
          setError("Объявление не найдено.");
          setIsLoading(false);
          return;
        }

        const data = listingSnap.data() as any;

        setTitle(data.title || "");
        setDescription(data.description || "");
        const loadedCategory = data.category || firstCategory;
        const loadedSubcategory = data.subcategory || firstSubcategory;
        setCategory(loadedCategory);
        setSubcategory(loadedSubcategory);
        setOriginalCategory(loadedCategory);
        setOriginalSubcategory(loadedSubcategory);
        const loadedGroup = getOfferGroup(loadedCategory);
        const legacyOffer = inferOfferFromLegacy({
          category: loadedCategory,
          capabilities: Array.isArray(data.capabilities)
            ? data.capabilities
            : [],
        });
        const availableActions = getOfferActions(loadedGroup);
        const loadedAction = availableActions.some(
          (item) => item.id === data.offerAction
        )
          ? data.offerAction
          : legacyOffer.actionId;
        const loadedFeatures: Record<string, boolean> = {};
        getOfferFeatures(loadedGroup).forEach((feature) => {
          loadedFeatures[feature.id] = Boolean(
            data.offerFeatures?.[feature.id] ??
              legacyOffer.features[feature.id]
          );
        });
        setOfferAction(loadedAction);
        setOfferFeatures(loadedFeatures);
        setCity(data.city || "");
        setPhone(data.phone || "");
        setPriceFrom(
          data.priceFrom === null || data.priceFrom === undefined
            ? ""
            : String(data.priceFrom)
        );
        setPaymentMethods(
          Array.isArray(data.paymentMethods) && data.paymentMethods.length
            ? data.paymentMethods
            : ["cash"]
        );
        setAuthorId(data.authorId || "");
        setMediaFiles(normalizeExistingMedia(data));
      } catch (loadError) {
        console.error(loadError);
        setError("Не получилось загрузить объявление.");
      } finally {
        setIsLoading(false);
      }
    }

    loadListing();
  }, [listingId, firstCategory, firstSubcategory]);

  useEffect(() => {
    if (authorId && user?.uid && authorId !== user.uid) {
      setError("У тебя нет доступа к редактированию этого объявления.");
    }
  }, [authorId, user?.uid]);

  function handleCategoryChange(value: string) {
    const nextCategory = categories.find((item) => item.name === value);
    const nextGroup = getOfferGroup(value);

    setCategory(value);
    setSubcategory(nextCategory?.subcategories?.[0] || "");
    setOfferAction(getOfferActions(nextGroup)[0]?.id || "");
    setOfferFeatures({});
  }

  function toggleOfferFeature(featureId: string) {
    setOfferFeatures((current) => ({
      ...current,
      [featureId]: !current[featureId],
    }));
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

      if (found && isLocalMedia(found)) {
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

    if (authorId && authorId !== user.uid) {
      setError("У тебя нет доступа к редактированию этого объявления.");
      return;
    }

    if (!listingId) {
      setError("Объявление не найдено.");
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

    if (!offerAction || !selectedOfferAction) {
      setError("Выбери, что именно ты предлагаешь.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const finalMedia: ListingMedia[] = mediaFiles
        .filter(isExistingMedia)
        .map(existingMediaToListingMedia);

      const newFiles = mediaFiles.filter(isLocalMedia);

      for (const item of newFiles) {
        const uploaded = await uploadOneFile(item);
        finalMedia.push(uploaded);
      }

      const imageUrls = finalMedia
        .filter((item) => item.type === "image")
        .map((item) => item.url);

      const videoUrls = finalMedia
        .filter((item) => item.type === "video")
        .map((item) => item.url);

      const listingCategory = originalCategory || category;
      const listingSubcategory = originalSubcategory || subcategory;
      const enabledFeatureIds = Object.entries(offerFeatures)
        .filter(([, enabled]) => enabled)
        .map(([featureId]) => featureId);
      const searchTags = buildListingSearchTags({
        title: title.trim(),
        description: description.trim(),
        category: listingCategory,
        subcategory: listingSubcategory,
        city: city.trim(),
        group: offerGroup,
        actionId: offerAction,
        enabledFeatureIds,
      });
      const capabilities = legacyCapabilitiesFromOffer(
        offerGroup,
        offerAction,
        offerFeatures
      );
      const catalogSection =
        offerGroup === "materials"
          ? "materials"
          : offerGroup === "equipment"
            ? "equipment"
            : offerGroup === "complex"
              ? "solutions"
              : "services";

      await updateDoc(doc(db, "listings", listingId), {
        title: title.trim(),
        description: description.trim(),
        category: listingCategory,
        subcategory: listingSubcategory,
        city: city.trim(),
        phone: phone.trim(),
        priceFrom: priceFrom.trim() ? Number(priceFrom) : null,
        paymentMethods,

        catalogSection,
        capabilities,
        searchGroup: offerGroup,
        offerAction,
        offerActionLabel: selectedOfferAction.label,
        offerFeatures,
        searchTags,
        searchText: searchTags.join(" "),
        searchVersion: 1,

        media: finalMedia,
        imageUrls,
        videoUrls,
        moderationStatus: "pending",
        moderationReason: "",
        moderationSubmittedAt: serverTimestamp(),
        moderationSource: "web",
        updatedAt: serverTimestamp(),
      });

      mediaFiles.forEach((item) => {
        if (isLocalMedia(item)) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });

      alert("Изменения отправлены на повторную модерацию.");
      router.push("/profile");
    } catch (saveError) {
      console.error(saveError);

      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не получилось сохранить объявление."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-3 sm:px-5">
        <div className="rounded-[32px] bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
          <Loader2 className="mx-auto animate-spin text-[#0057ff]" size={36} />
          <p className="mt-4 font-black text-gray-950">
            Загружаем объявление...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-3 py-6 sm:px-5 sm:py-10">
      <div className="mx-auto max-w-7xl">
        <Link
          href={listingId ? `/listing/${listingId}` : "/profile"}
          className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-[#0057ff] shadow-sm"
        >
          <ArrowLeft size={18} />
          Назад
        </Link>

        <div className="mt-5 grid gap-5 sm:mt-8 sm:gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <form
            onSubmit={handleSubmit}
            className="rounded-[26px] bg-white p-4 shadow-sm ring-1 ring-gray-100 sm:rounded-[36px] sm:p-6 md:p-8"
          >
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#0057ff]">
                Редактирование
              </p>

              <h1 className="mt-3 text-3xl font-black text-gray-950 sm:text-4xl">
                Изменить объявление
              </h1>

              <p className="mt-3 text-gray-500">
                Фото появляется сразу после выбора. На сервер загружается после
                кнопки “Сохранить”.
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
                <div className="rounded-2xl bg-slate-50 px-5 py-4 ring-1 ring-slate-200">
                  <div className="text-xs font-black uppercase tracking-wider text-slate-400">Категория зафиксирована</div>
                  <div className="mt-1 font-black text-slate-900">{category}</div>
                </div>

                <div className="rounded-2xl bg-slate-50 px-5 py-4 ring-1 ring-slate-200">
                  <div className="text-xs font-black uppercase tracking-wider text-slate-400">Подкатегория зафиксирована</div>
                  <div className="mt-1 font-black text-slate-900">{subcategory}</div>
                </div>

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

            <section className="mt-6 rounded-[24px] border border-blue-100 bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_58%,#f8fbff_100%)] p-5 sm:mt-8 sm:rounded-[30px] md:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0057ff]">
                    Точная фильтрация
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-gray-950">
                    Что вы предлагаете?
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-gray-500">
                    Эти параметры одинаково отображаются и фильтруются на сайте и в приложении.
                  </p>
                </div>

                <div className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#0057ff] shadow-sm ring-1 ring-blue-100">
                  <span className="text-xl">{offerGroupInfo.emoji}</span>
                  {offerGroupInfo.title}
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {offerActions.map((action) => {
                  const active = action.id === offerAction;

                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => setOfferAction(action.id)}
                      className={[
                        "group relative min-h-[128px] rounded-[24px] border p-4 text-left transition duration-300",
                        active
                          ? "border-[#0057ff] bg-[#0057ff] text-white shadow-xl shadow-blue-600/20"
                          : "border-white bg-white text-gray-950 shadow-sm hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg",
                      ].join(" ")}
                    >
                      <div
                        className={[
                          "flex h-9 w-9 items-center justify-center rounded-2xl transition",
                          active
                            ? "bg-white text-[#0057ff]"
                            : "bg-blue-50 text-[#0057ff]",
                        ].join(" ")}
                      >
                        {active ? (
                          <Check size={19} strokeWidth={3} />
                        ) : (
                          <span className="h-2.5 w-2.5 rounded-full bg-[#0057ff]" />
                        )}
                      </div>
                      <p className={`mt-4 text-base font-black ${active ? "text-white" : "text-gray-950"}`}>
                        {action.label}
                      </p>
                      <p className={`mt-1 text-xs font-bold leading-5 ${active ? "text-blue-100" : "text-gray-500"}`}>
                        {action.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6">
                <h3 className="text-base font-black text-gray-950">Дополнительные возможности</h3>
                <p className="mt-1 text-sm font-medium text-gray-500">
                  Отметьте только те возможности, которые действительно доступны клиенту.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {offerFeatureOptions.map((feature) => {
                    const active = Boolean(offerFeatures[feature.id]);

                    return (
                      <button
                        key={feature.id}
                        type="button"
                        onClick={() => toggleOfferFeature(feature.id)}
                        className={[
                          "flex min-h-[76px] items-center gap-3 rounded-[22px] border px-4 py-3 text-left transition duration-300",
                          active
                            ? "border-[#0057ff] bg-white shadow-md shadow-blue-500/10"
                            : "border-white bg-white/75 hover:border-blue-200 hover:bg-white",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition",
                            active
                              ? "border-[#0057ff] bg-[#0057ff] text-white"
                              : "border-gray-200 bg-gray-50 text-gray-300",
                          ].join(" ")}
                        >
                          <Check size={19} strokeWidth={3} />
                        </span>
                        <span>
                          <span className="block text-sm font-black text-gray-950">{feature.label}</span>
                          <span className="mt-1 block text-xs font-bold leading-5 text-gray-500">
                            {feature.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="mt-6 rounded-[24px] sm:mt-8 sm:rounded-[28px] border border-gray-100 bg-gray-50 p-5">
              <h2 className="text-2xl font-black text-gray-950">Фото и видео</h2>

              <p className="mt-2 text-sm font-medium text-gray-500">
                Можно оставить старые фото, удалить их или добавить новые.
              </p>

              <input
                id="listing-edit-media-input"
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleMediaSelect}
                className="hidden"
              />

              <label
                htmlFor="listing-edit-media-input"
                className="mt-5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#0057ff] px-5 py-3 sm:inline-flex sm:w-auto font-black text-white shadow-lg shadow-blue-500/20 transition hover:-translate-y-0.5"
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
                  {mediaFiles.map((item) => {
                    const previewUrl = isExistingMedia(item)
                      ? item.url
                      : item.previewUrl;

                    return (
                      <div
                        key={item.id}
                        className="relative overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-gray-100"
                      >
                        {item.type === "image" ? (
                          <img
                            src={previewUrl}
                            alt="Фото объявления"
                            className="h-36 w-full object-cover"
                          />
                        ) : (
                          <video
                            src={previewUrl}
                            className="h-36 w-full object-cover"
                            controls
                          />
                        )}

                        {isExistingMedia(item) && (
                          <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-1 text-[11px] font-black text-[#0057ff] shadow-sm">
                            Уже было
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => removeMediaFile(item.id)}
                          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-white shadow-lg"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="mt-6 rounded-[24px] sm:mt-8 sm:rounded-[28px] border border-gray-100 bg-white p-5">
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
              className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl sm:mt-8 sm:rounded-3xl bg-[#0057ff] px-6 py-5 text-lg font-black text-white shadow-xl shadow-blue-500/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? (
                <>
                  <Loader2 size={22} className="animate-spin" />
                  Загружаем и сохраняем...
                </>
              ) : (
                <>
                  <Save size={22} />
                  Сохранить изменения
                </>
              )}
            </button>
          </form>

          <aside className="h-fit rounded-[26px] bg-white p-4 shadow-sm ring-1 ring-gray-100 sm:rounded-[36px] sm:p-6 lg:sticky lg:top-[102px]">
            <h2 className="text-2xl font-black text-gray-950">Медиа</h2>

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
                <span>Новых файлов</span>
                <span className="text-gray-950">
                  {mediaFiles.filter(isLocalMedia).length}
                </span>
              </div>
            </div>

            <div className="mt-6 rounded-3xl bg-blue-50 p-5 text-sm font-bold leading-6 text-[#0057ff]">
              Этот файл использует тот же рабочий загрузчик, что и создание
              нового объявления: /api/upload.
            </div>

            {mediaFiles.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  mediaFiles.forEach((item) => {
                    if (isLocalMedia(item)) {
                      URL.revokeObjectURL(item.previewUrl);
                    }
                  });
                  setMediaFiles([]);
                }}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 px-5 py-3 font-black text-red-600"
              >
                <Trash2 size={18} />
                Удалить все фото
              </button>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
