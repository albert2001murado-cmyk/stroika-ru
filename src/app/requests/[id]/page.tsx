"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import type { CustomerRequest } from "@/types";
import { firestoreDateToMillis } from "@/types";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Edit3,
  Eye,
  ImageIcon,
  MapPin,
  MessageCircle,
  Phone,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function formatBudget(request: CustomerRequest) {
  const from = request.budgetFrom ?? request.budget ?? null;
  const to = request.budgetTo ?? null;

  if (from && to) {
    return `${from.toLocaleString("ru-RU")}–${to.toLocaleString("ru-RU")} ₽`;
  }

  if (from) return `от ${from.toLocaleString("ru-RU")} ₽`;
  if (to) return `до ${to.toLocaleString("ru-RU")} ₽`;
  return "По договорённости";
}

function formatDate(value: CustomerRequest["createdAt"]) {
  const millis = firestoreDateToMillis(value);

  if (!millis) return "Дата не указана";

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(millis));
}

export default function CustomerRequestPage() {
  const params = useParams();
  const { user } = useAuth();

  const requestId =
    typeof params?.id === "string"
      ? params.id
      : Array.isArray(params?.id)
        ? params.id[0]
        : "";

  const [request, setRequest] = useState<CustomerRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [customerPhone, setCustomerPhone] = useState("");

  useEffect(() => {
    if (!requestId) {
      setLoading(false);
      return;
    }

    return onSnapshot(
      doc(db, "customerRequests", requestId),
      (snapshot) => {
        setRequest(
          snapshot.exists()
            ? ({ id: snapshot.id, ...snapshot.data() } as CustomerRequest)
            : null
        );
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [requestId]);

  useEffect(() => {
    let cancelled = false;

    const phoneFromRequest = request?.customerPhone?.trim() || "";

    if (phoneFromRequest) {
      setCustomerPhone(phoneFromRequest);
      return () => {
        cancelled = true;
      };
    }

    if (!request?.customerId) {
      setCustomerPhone("");
      return () => {
        cancelled = true;
      };
    }

    getDoc(doc(db, "users", request.customerId))
      .then((snapshot) => {
        if (cancelled) return;

        const profile = snapshot.exists() ? snapshot.data() : null;
        const phone =
          typeof profile?.phone === "string" ? profile.phone.trim() : "";

        setCustomerPhone(phone);
      })
      .catch(() => {
        if (!cancelled) setCustomerPhone("");
      });

    return () => {
      cancelled = true;
    };
  }, [request?.customerId, request?.customerPhone]);

  const images = useMemo(() => request?.imageUrls?.filter(Boolean) || [], [request]);

  useEffect(() => {
    if (activeImageIndex >= images.length) {
      setActiveImageIndex(0);
    }
  }, [activeImageIndex, images.length]);

  useEffect(() => {
    if (!galleryOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setGalleryOpen(false);
      if (event.key === "ArrowLeft") {
        setActiveImageIndex((current) =>
          images.length ? (current - 1 + images.length) % images.length : 0
        );
      }
      if (event.key === "ArrowRight") {
        setActiveImageIndex((current) =>
          images.length ? (current + 1) % images.length : 0
        );
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [galleryOpen, images.length]);

  function showPreviousImage() {
    setActiveImageIndex((current) =>
      images.length ? (current - 1 + images.length) % images.length : 0
    );
  }

  function showNextImage() {
    setActiveImageIndex((current) =>
      images.length ? (current + 1) % images.length : 0
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f2f6fd] px-5">
        <div className="flex items-center gap-3 rounded-[24px] bg-white px-7 py-5 font-black text-slate-700 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70">
          <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-blue-100 border-t-[#0057ff]" />
          Загружаем заявку...
        </div>
      </main>
    );
  }

  if (!request) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f2f6fd] px-5">
        <div className="w-full max-w-lg rounded-[34px] bg-white p-9 text-center shadow-[0_24px_80px_rgba(15,23,42,0.10)] ring-1 ring-slate-200/70">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-[#0057ff]">
            <ImageIcon size={31} />
          </div>
          <h1 className="mt-5 text-3xl font-black text-slate-950">Заявка не найдена</h1>
          <p className="mt-3 text-slate-500">Возможно, публикация была удалена или закрыта.</p>
          <Link
            href="/requests"
            className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-[#0057ff] px-6 py-3.5 font-black text-white transition hover:-translate-y-0.5 hover:bg-[#004de6] hover:shadow-lg active:scale-95"
          >
            <ArrowLeft size={18} />
            Вернуться к заявкам
          </Link>
        </div>
      </main>
    );
  }

  const isOwner = user?.uid === request.customerId;
  const isActive = request.status === "active";
  const currentImage = images[activeImageIndex] || "";

  return (
    <main className="min-h-screen bg-[#f2f6fd] pb-16">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_15%_10%,rgba(0,87,255,0.14),transparent_34%),radial-gradient(circle_at_85%_12%,rgba(56,189,248,0.14),transparent_30%)]" />

      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/requests"
            className="group inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-slate-800 shadow-sm ring-1 ring-slate-200/80 transition duration-300 hover:-translate-y-0.5 hover:text-[#0057ff] hover:shadow-lg active:scale-95"
          >
            <ArrowLeft className="transition-transform duration-300 group-hover:-translate-x-1" size={18} />
            Назад
          </Link>

          {isOwner ? (
            <Link
              href={`/requests/${request.id}/edit`}
              className="group inline-flex items-center gap-2 rounded-2xl bg-[#0057ff] px-5 py-3 font-black text-white shadow-lg shadow-blue-600/20 transition duration-300 hover:-translate-y-0.5 hover:bg-[#004de6] hover:shadow-xl active:scale-95"
            >
              <Edit3 className="transition-transform duration-300 group-hover:-rotate-6" size={18} />
              Редактировать
            </Link>
          ) : null}
        </div>

        <section className="relative mt-5 overflow-hidden rounded-[40px] bg-gradient-to-br from-[#0864ff] via-[#0057ff] to-[#0044cf] px-6 py-8 text-white shadow-[0_28px_90px_rgba(0,87,255,0.20)] sm:px-8 md:py-10 lg:px-11">
          <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-cyan-300/10 blur-3xl" />

          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white px-3.5 py-1.5 text-xs font-black text-[#0057ff] shadow-sm">
                  {request.category || "Строительные работы"}
                </span>

                {request.urgency === "urgent" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500 px-3.5 py-1.5 text-xs font-black text-white shadow-sm">
                    <Sparkles size={14} />
                    Срочно
                  </span>
                ) : null}

                <span
                  className={`rounded-full px-3.5 py-1.5 text-xs font-black shadow-sm ${
                    isActive ? "bg-emerald-500 text-white" : "bg-slate-900/25 text-white"
                  }`}
                >
                  {isActive ? "Открыта" : "Закрыта"}
                </span>
              </div>

              <h1 className="mt-6 max-w-4xl text-4xl font-black leading-[1.04] tracking-[-0.035em] sm:text-5xl lg:text-6xl">
                {request.title}
              </h1>

              <div className="mt-7 flex flex-wrap gap-3 text-sm font-bold text-blue-50">
                <span className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2.5 ring-1 ring-white/15 backdrop-blur-sm">
                  <MapPin size={17} />
                  {request.city || "Город не указан"}
                </span>
                <span className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2.5 ring-1 ring-white/15 backdrop-blur-sm">
                  <CalendarDays size={17} />
                  {request.deadline || "Срок по договорённости"}
                </span>
              </div>
            </div>

            <div className="rounded-[28px] bg-white/12 p-4 ring-1 ring-white/15 backdrop-blur-md">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-100">Заказчик</p>
              <div className="mt-3 flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[22px] bg-white/15 ring-1 ring-white/20">
                  {request.customerAvatar ? (
                    <img
                      src={request.customerAvatar}
                      alt={request.customerName || "Заказчик"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <UserRound size={30} />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xl font-black">
                    {request.customerName || "Заказчик"}
                  </p>
                  <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-[#0057ff]">
                    <BadgeCheck size={14} />
                    Автор заявки
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="space-y-6">
            <section className="overflow-hidden rounded-[34px] bg-white p-4 shadow-[0_22px_70px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70 sm:p-5">
              {images.length ? (
                <>
                  <button
                    type="button"
                    onClick={() => setGalleryOpen(true)}
                    className="group relative block aspect-[16/10] w-full overflow-hidden rounded-[28px] bg-slate-100 text-left"
                  >
                    <img
                      src={currentImage}
                      alt={`Фото заявки ${activeImageIndex + 1}`}
                      className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.025]"
                    />
                    <span className="absolute inset-0 bg-gradient-to-t from-slate-950/45 via-transparent to-transparent opacity-80" />

                    <span className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-2xl bg-slate-950/65 px-3.5 py-2 text-xs font-black text-white backdrop-blur-md">
                      <ImageIcon size={15} />
                      Открыть фото
                    </span>

                    <span className="absolute bottom-4 right-4 rounded-2xl bg-white px-3.5 py-2 text-xs font-black text-slate-950 shadow-lg">
                      {activeImageIndex + 1} / {images.length}
                    </span>
                  </button>

                  {images.length > 1 ? (
                    <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                      {images.map((image, index) => (
                        <button
                          type="button"
                          key={`${image}-${index}`}
                          onClick={() => setActiveImageIndex(index)}
                          className={`relative h-20 w-28 shrink-0 overflow-hidden rounded-2xl transition duration-300 hover:-translate-y-0.5 active:scale-95 ${
                            activeImageIndex === index
                              ? "ring-[3px] ring-[#0057ff] ring-offset-2"
                              : "opacity-70 hover:opacity-100"
                          }`}
                        >
                          <img
                            src={image}
                            alt={`Миниатюра ${index + 1}`}
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="flex min-h-72 flex-col items-center justify-center rounded-[28px] bg-gradient-to-br from-blue-50 to-slate-50 px-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-[#0057ff] shadow-sm">
                    <ImageIcon size={30} />
                  </div>
                  <h2 className="mt-4 text-xl font-black text-slate-950">Фотографии не добавлены</h2>
                  <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                    Заказчик подробно описал задачу ниже.
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-[34px] bg-white p-6 shadow-[0_22px_70px_rgba(15,23,42,0.07)] ring-1 ring-slate-200/70 sm:p-8">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#0057ff]">
                  <MessageCircle size={21} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.15em] text-[#0057ff]">Подробности</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950">Описание задачи</h2>
                </div>
              </div>

              <p className="mt-6 whitespace-pre-wrap text-base leading-8 text-slate-600">
                {request.description}
              </p>
            </section>
          </div>

          <aside className="space-y-5 lg:sticky lg:top-28">
            <section className="rounded-[34px] bg-white p-5 shadow-[0_22px_70px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70 sm:p-6">
              <p className="text-xs font-black uppercase tracking-[0.15em] text-[#0057ff]">Условия заказа</p>

              <div className="mt-5 space-y-3">
                <div className="flex items-start gap-4 rounded-[22px] bg-[#f4f7fc] p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#0057ff] shadow-sm">
                    <CircleDollarSign size={21} />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-slate-500">Бюджет</p>
                    <p className="mt-1 text-lg font-black text-slate-950">{formatBudget(request)}</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 rounded-[22px] bg-[#f4f7fc] p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#0057ff] shadow-sm">
                    <MapPin size={21} />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-slate-500">Город</p>
                    <p className="mt-1 text-lg font-black text-slate-950">{request.city || "Не указан"}</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 rounded-[22px] bg-[#f4f7fc] p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#0057ff] shadow-sm">
                    <CalendarDays size={21} />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-slate-500">Желаемый срок</p>
                    <p className="mt-1 text-lg font-black text-slate-950">
                      {request.deadline || "По договорённости"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 rounded-[22px] bg-[#f4f7fc] p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#0057ff] shadow-sm">
                    <Clock3 size={21} />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-slate-500">Опубликовано</p>
                    <p className="mt-1 text-base font-black text-slate-950">{formatDate(request.createdAt)}</p>
                  </div>
                </div>
              </div>

              {(request.viewsCount || request.offersCount) ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {typeof request.viewsCount === "number" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">
                      <Eye size={14} />
                      {request.viewsCount} просмотров
                    </span>
                  ) : null}
                  {typeof request.offersCount === "number" ? (
                    <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-[#0057ff]">
                      Откликов: {request.offersCount}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {!isOwner && isActive ? (
                <div className="mt-5 space-y-3">
                  <Link
                    href={`/messages/${encodeURIComponent(request.customerId)}`}
                    className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0057ff] px-5 py-4 text-base font-black text-white shadow-lg shadow-blue-600/20 transition duration-300 hover:-translate-y-0.5 hover:bg-[#004de6] hover:shadow-xl active:scale-[0.98]"
                  >
                    <MessageCircle
                      className="transition-transform duration-300 group-hover:scale-110"
                      size={20}
                    />
                    Написать заказчику
                  </Link>

                  {customerPhone ? (
                    <a
                      href={`tel:${customerPhone.replace(/[^\d+]/g, "")}`}
                      className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ffd43b] px-5 py-4 text-base font-black text-slate-950 shadow-lg shadow-yellow-400/25 transition duration-300 hover:-translate-y-0.5 hover:bg-[#ffca0a] hover:shadow-xl active:scale-[0.98]"
                    >
                      <Phone
                        className="transition-transform duration-300 group-hover:rotate-[-8deg] group-hover:scale-110"
                        size={20}
                      />
                      Позвонить
                    </a>
                  ) : (
                    <div className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-100 px-5 py-4 text-sm font-black text-slate-400">
                      <Phone size={19} />
                      Телефон не указан
                    </div>
                  )}
                </div>
              ) : null}

              {isOwner ? (
                <div className="mt-5 rounded-2xl bg-blue-50 px-4 py-3 text-center text-sm font-bold leading-6 text-[#0057ff]">
                  Это ваша заявка. Изменить данные можно кнопкой «Редактировать» сверху.
                </div>
              ) : null}
            </section>
          </aside>
        </div>
      </div>

      {galleryOpen && currentImage ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/95 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setGalleryOpen(false);
          }}
        >
          <div className="absolute left-4 top-4 rounded-2xl bg-white/10 px-4 py-2 text-sm font-black text-white ring-1 ring-white/15 backdrop-blur-md sm:left-6 sm:top-6">
            {activeImageIndex + 1} из {images.length}
          </div>

          <button
            type="button"
            aria-label="Закрыть галерею"
            onClick={() => setGalleryOpen(false)}
            className="absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/20 transition duration-300 hover:rotate-90 hover:bg-white/20 active:scale-90 sm:right-6 sm:top-6"
          >
            <X size={25} />
          </button>

          {images.length > 1 ? (
            <button
              type="button"
              aria-label="Предыдущее фото"
              onClick={showPreviousImage}
              className="absolute left-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/20 transition hover:bg-white hover:text-slate-950 active:scale-90 sm:left-6 sm:h-14 sm:w-14"
            >
              <ChevronLeft size={28} />
            </button>
          ) : null}

          <img
            src={currentImage}
            alt={`Фотография заявки ${activeImageIndex + 1}`}
            className="max-h-[88vh] max-w-[88vw] rounded-[24px] object-contain shadow-2xl"
          />

          {images.length > 1 ? (
            <button
              type="button"
              aria-label="Следующее фото"
              onClick={showNextImage}
              className="absolute right-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/20 transition hover:bg-white hover:text-slate-950 active:scale-90 sm:right-6 sm:h-14 sm:w-14"
            >
              <ChevronRight size={28} />
            </button>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
