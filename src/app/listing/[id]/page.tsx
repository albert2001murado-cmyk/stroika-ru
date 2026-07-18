"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import type { Listing, Review, UserProfile } from "@/types";
import {
  Banknote,
  CreditCard,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  PlayCircle,
  Star,
  UserRound,
} from "lucide-react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

function paymentText(listing: Listing) {
  const methods = listing.paymentMethods || [];

  if (methods.includes("cash") && methods.includes("transfer")) {
    return "Наличными или переводом";
  }

  if (methods.includes("transfer")) {
    return "Переводом";
  }

  return "Наличными";
}

function paymentIcon(listing: Listing) {
  const methods = listing.paymentMethods || [];

  if (methods.includes("transfer")) {
    return <CreditCard size={20} />;
  }

  return <Banknote size={20} />;
}

function getChatId(listingId: string, ownerId: string, clientId: string) {
  return `${listingId}_${[ownerId, clientId].sort().join("_")}`;
}

export default function ListingPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { user, profile } = useAuth();

  const [listing, setListing] = useState<Listing | null>(null);
  const [authorProfile, setAuthorProfile] = useState<UserProfile | null>(null);
  const [authorAvatar, setAuthorAvatar] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeMediaUrl, setActiveMediaUrl] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");

  useEffect(() => {
    async function loadListing() {
      const snap = await getDoc(doc(db, "listings", id));

      if (snap.exists()) {
        const data = {
          id: snap.id,
          ...snap.data(),
        } as Listing;

        setListing(data);
        setAuthorAvatar(data.authorAvatarUrl || "");

        if (data.imageUrls?.[0]) {
          setActiveMediaUrl(data.imageUrls[0]);
        } else if (data.videoUrls?.[0]) {
          setActiveMediaUrl(data.videoUrls[0]);
        }

        if (data.authorId) {
          const userSnap = await getDoc(doc(db, "users", data.authorId));

          if (userSnap.exists()) {
            const userData = {
              uid: userSnap.id,
              ...userSnap.data(),
            } as UserProfile;

            setAuthorProfile(userData);
            setAuthorAvatar(userData.avatarUrl || data.authorAvatarUrl || "");
          }
        }
      }

      setLoading(false);
    }

    loadListing();
  }, [id]);

  useEffect(() => {
    const q = query(collection(db, "reviews"), where("listingId", "==", id));

    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data(),
      })) as Review[];

      data.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

      setReviews(data);
    });

    return () => unsub();
  }, [id]);

  const averageRating = useMemo(() => {
    if (!reviews.length) return 0;

    const total = reviews.reduce((sum, review) => sum + review.rating, 0);
    return total / reviews.length;
  }, [reviews]);

  const allMedia = useMemo(() => {
    if (!listing) return [];

    if (listing.media?.length) {
      return listing.media.map((item) => ({
        type: item.type,
        url: item.url,
      }));
    }

    const images =
      listing.imageUrls?.map((url) => ({
        type: "image" as const,
        url,
      })) || [];

    const videos =
      listing.videoUrls?.map((url) => ({
        type: "video" as const,
        url,
      })) || [];

    return [...images, ...videos];
  }, [listing]);

  const activeMedia =
    allMedia.find((item) => item.url === activeMediaUrl) || allMedia[0];

  async function handleStartChat() {
    setChatError("");

    if (!user) {
      router.push("/auth");
      return;
    }

    if (!listing) return;

    if (!listing.authorId) {
      setChatError("У объявления не указан исполнитель.");
      return;
    }

    const ownerId = listing.authorId;

    if (user.uid === ownerId) {
      router.push("/messages");
      return;
    }

    setChatLoading(true);

    try {
      const chatId = getChatId(listing.id, ownerId, user.uid);
      const chatRef = doc(db, "chats", chatId);

      const currentUserName =
        profile?.displayName || user.displayName || user.email || "Пользователь";

      const currentAvatar = profile?.avatarUrl || user.photoURL || "";

      const ownerName =
        authorProfile?.displayName || listing.authorName || "Исполнитель";

      const ownerAvatar = authorProfile?.avatarUrl || authorAvatar || "";

      await setDoc(
        chatRef,
        {
          listingId: listing.id,
          listingTitle: listing.title,
          listingImageUrl: listing.imageUrls?.[0] || listing.media?.find((item) => item.type === "image")?.url || "",
          participantIds: [ownerId, user.uid],
          participants: {
            [ownerId]: {
              uid: ownerId,
              displayName: ownerName,
              avatarUrl: ownerAvatar,
            },
            [user.uid]: {
              uid: user.uid,
              displayName: currentUserName,
              avatarUrl: currentAvatar,
            },
          },
          ownerId,
          clientId: user.uid,
          lastMessageText: "Чат создан",
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      router.push(`/messages/${chatId}`);
    } catch (err) {
      console.error(err);
      setChatError(
        err instanceof Error
          ? err.message
          : "Не получилось открыть чат. Проверь правила Firestore."
      );
    } finally {
      setChatLoading(false);
    }
  }

  async function handleReview(e: FormEvent) {
    e.preventDefault();

    if (!user) {
      router.push("/auth");
      return;
    }

    if (!reviewText.trim()) return;

    await addDoc(collection(db, "reviews"), {
      listingId: id,
      authorId: user.uid,
      authorName: profile?.displayName || user.displayName || user.email,
      rating,
      text: reviewText.trim(),
      createdAt: serverTimestamp(),
    });

    setReviewText("");
    setRating(5);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-5 py-10">
        <div className="mx-auto max-w-6xl">Загрузка...</div>
      </main>
    );
  }

  if (!listing) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-5 py-10">
        <div className="mx-auto max-w-6xl rounded-[30px] bg-white p-8 text-center shadow-sm">
          <h1 className="text-3xl font-black text-gray-950">
            Объявление не найдено
          </h1>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="btn-primary mt-6"
          >
            На главную
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-5 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <section className="space-y-6">
            <div className="overflow-hidden rounded-[34px] bg-white shadow-sm">
              {allMedia.length > 0 ? (
                <>
                  <div className="relative flex min-h-[420px] items-center justify-center bg-gray-100">
                    {activeMedia?.type === "video" ? (
                      <video
                        src={activeMedia.url}
                        className="max-h-[620px] max-w-full object-contain"
                        controls
                      />
                    ) : (
                      <img
                        src={activeMedia?.url}
                        alt={listing.title}
                        className="max-h-[620px] max-w-full object-contain"
                      />
                    )}
                  </div>

                  {allMedia.length > 1 && (
                    <div className="grid grid-cols-4 gap-3 p-4 sm:grid-cols-6">
                      {allMedia.map((item) => (
                        <button
                          key={item.url}
                          type="button"
                          onClick={() => setActiveMediaUrl(item.url)}
                          className={`relative h-20 overflow-hidden rounded-2xl border ${
                            activeMedia?.url === item.url
                              ? "border-[#0057ff]"
                              : "border-gray-200"
                          }`}
                        >
                          {item.type === "video" ? (
                            <div className="flex h-full w-full items-center justify-center bg-blue-50 text-[#0057ff]">
                              <PlayCircle size={28} />
                            </div>
                          ) : (
                            <img
                              src={item.url}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-72 items-center justify-center bg-blue-50 text-5xl font-black text-blue-200">
                  Стройка.ру
                </div>
              )}
            </div>

            <div className="rounded-[34px] bg-white p-8 shadow-sm">
              <p className="font-black text-[#0057ff]">
                {listing.category} · {listing.subcategory}
              </p>

              <h1 className="mt-3 text-4xl font-black text-gray-950">
                {listing.title}
              </h1>

              <p className="mt-5 whitespace-pre-wrap text-lg leading-8 text-gray-600">
                {listing.description}
              </p>

              <div className="mt-8 grid gap-4 rounded-[28px] bg-[#f5f7fb] p-5 md:grid-cols-2">
                <div>
                  <p className="text-sm font-bold text-gray-500">Город</p>
                  <p className="mt-1 flex items-center gap-2 font-black text-gray-950">
                    <MapPin size={18} className="text-[#0057ff]" />
                    {listing.city}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-bold text-gray-500">Телефон</p>
                  <p className="mt-1 flex items-center gap-2 font-black text-gray-950">
                    <Phone size={18} className="text-[#0057ff]" />
                    {listing.phone}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-bold text-gray-500">Исполнитель</p>

                  <Link
                    href={`/user/${listing.authorId}`}
                    className="mt-2 flex w-fit items-center gap-3 rounded-2xl transition hover:bg-blue-50"
                  >
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-[#0057ff]">
                      {authorAvatar ? (
                        <img
                          src={authorAvatar}
                          alt={listing.authorName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <UserRound size={24} />
                      )}
                    </div>

                    <p className="font-black text-gray-950">
                      {authorProfile?.displayName || listing.authorName}
                    </p>
                  </Link>
                </div>

                <div>
                  <p className="text-sm font-bold text-gray-500">Цена от</p>
                  <p className="mt-1 font-black text-gray-950">
                    {listing.priceFrom
                      ? `${listing.priceFrom.toLocaleString("ru-RU")} ₽`
                      : "Договорная"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[34px] bg-white p-8 shadow-sm">
              <h2 className="text-3xl font-black text-gray-950">Отзывы</h2>

              <form onSubmit={handleReview} className="mt-5 space-y-4">
                <select
                  className="input bg-white font-bold text-gray-950"
                  value={rating}
                  onChange={(e) => setRating(Number(e.target.value))}
                >
                  <option value={5}>5 — отлично</option>
                  <option value={4}>4 — хорошо</option>
                  <option value={3}>3 — нормально</option>
                  <option value={2}>2 — плохо</option>
                  <option value={1}>1 — ужасно</option>
                </select>

                <textarea
                  className="input min-h-28 resize-none"
                  placeholder="Написать отзыв"
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                />

                <button className="btn-primary">Оставить отзыв</button>
              </form>

              <div className="mt-6 space-y-4">
                {reviews.length === 0 ? (
                  <p className="text-gray-500">Отзывов пока нет.</p>
                ) : (
                  reviews.map((review) => (
                    <div
                      key={review.id}
                      className="rounded-3xl border border-gray-100 bg-gray-50 p-5"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <p className="font-black text-gray-950">
                          {review.authorName}
                        </p>

                        <p className="flex items-center gap-1 font-black text-yellow-500">
                          <Star size={18} className="fill-yellow-400" />
                          {review.rating}
                        </p>
                      </div>

                      <p className="mt-3 text-gray-600">{review.text}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <aside className="h-fit rounded-[34px] bg-white p-6 shadow-sm lg:sticky lg:top-24">
            <Link
              href={`/user/${listing.authorId}`}
              className="flex items-center gap-4 rounded-3xl transition hover:bg-blue-50"
            >
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-[#0057ff] ring-4 ring-blue-50">
                {authorAvatar ? (
                  <img
                    src={authorAvatar}
                    alt={listing.authorName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <UserRound size={30} />
                )}
              </div>

              <div>
                <h2 className="text-2xl font-black text-gray-950">
                  {authorProfile?.displayName || listing.authorName}
                </h2>

                <p className="mt-1 text-gray-500">
                  {listing.accountType === "ip"
                    ? "ИП"
                    : listing.accountType === "ooo"
                    ? "ООО"
                    : "Физлицо"}
                </p>
              </div>
            </Link>

            <div className="mt-6 rounded-3xl bg-[#f5f7fb] p-5">
              <p className="text-sm font-bold text-gray-500">Рейтинг</p>

              <p className="mt-2 flex items-center gap-2 text-2xl font-black text-gray-950">
                <Star size={24} className="fill-[#ffd233] text-[#ffd233]" />
                {averageRating ? averageRating.toFixed(1) : "—"}
              </p>

              <p className="mt-1 text-sm text-gray-500">
                Отзывов: {reviews.length}
              </p>
            </div>

            <div className="mt-4 rounded-3xl bg-blue-50 p-5 text-[#0057ff]">
              <p className="flex items-center gap-2 font-black">
                {paymentIcon(listing)}
                Оплата
              </p>

              <p className="mt-2 font-bold">{paymentText(listing)}</p>
            </div>

            {user?.uid === listing.authorId && (
              <Link
                href={`/listing/${listing.id}/edit`}
                className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-[#0057ff] px-5 py-4 text-lg font-black text-white transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-600/25"
              >
                Редактировать объявление
              </Link>
            )}

            <button
              type="button"
              onClick={handleStartChat}
              disabled={chatLoading}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0057ff] px-5 py-4 text-lg font-black text-white transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-600/25 disabled:opacity-70"
            >
              {chatLoading ? (
                <Loader2 className="animate-spin" size={21} />
              ) : (
                <MessageCircle size={21} />
              )}
              {user?.uid === listing.authorId ? "Мои сообщения" : "Написать"}
            </button>

            {chatError && (
              <p className="mt-3 rounded-2xl bg-red-50 p-3 text-sm font-black text-red-600">
                {chatError}
              </p>
            )}

            <a
              href={`tel:${listing.phone}`}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ffd233] px-5 py-4 text-lg font-black text-[#003b95] transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-yellow-300/30"
            >
              <Phone size={21} />
              Позвонить
            </a>
          </aside>
        </div>
      </div>
    </main>
  );
}
