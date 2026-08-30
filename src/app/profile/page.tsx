"use client";

import CustomerRequestCard from "@/components/CustomerRequestCard";
import { ListingCard } from "@/components/ListingCard";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import type { AccountType, CustomerRequest, Listing } from "@/types";
import { updateProfile } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import {
  BadgeCheck,
  Building2,
  Camera,
  Clock3,
  ClipboardList,
  HardHat,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Save,
  Trash2,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import ProfileTools from "@/components/ProfileTools";
import { moderationLabel } from "@/lib/moderation";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";

type UploadedFile = {
  type: "image" | "video";
  url: string;
  path: string;
  name: string;
  size?: number;
};

export default function ProfilePage() {
  const { user, profile, loading } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("individual");
  const [companyName, setCompanyName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");

  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarPath, setAvatarPath] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState("");

  const [listings, setListings] = useState<Listing[]>([]);
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [publicationTab, setPublicationTab] = useState<"listings" | "requests">("listings");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!profile && !user) return;

    setDisplayName(profile?.displayName || user?.displayName || "");
    setAccountType(profile?.accountType || "individual");
    setCompanyName(profile?.companyName || "");
    setCity(profile?.city || "");
    setPhone(profile?.phone || "");
    setAvatarUrl(profile?.avatarUrl || user?.photoURL || "");
    setAvatarPath(profile?.avatarPath || "");
  }, [profile, user]);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "listings"),
      where("authorId", "==", user.uid)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data(),
      })) as Listing[];

      data.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

      setListings(data);
    });

    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const requestQuery = query(
      collection(db, "customerRequests"),
      where("customerId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(requestQuery, (snapshot) => {
      const data = snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      })) as CustomerRequest[];

      data.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

      setRequests(data);
    });

    return () => unsubscribe();
  }, [user]);

  function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage("Можно загрузить только изображение.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage("Фото профиля слишком большое. Максимум 5 МБ.");
      return;
    }

    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setMessage("");
  }

  async function uploadAvatar(file: File): Promise<UploadedFile> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", "avatars");

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Не получилось загрузить фото профиля.");
    }

    return data as UploadedFile;
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();

    if (!user) return;

    setSaving(true);
    setMessage("");

    try {
      let finalAvatarUrl = avatarUrl;
      let finalAvatarPath = avatarPath;

      if (avatarFile) {
        setMessage("Загружаем фото профиля...");
        const uploadedAvatar = await uploadAvatar(avatarFile);

        finalAvatarUrl = uploadedAvatar.url;
        finalAvatarPath = uploadedAvatar.path;

        setAvatarUrl(uploadedAvatar.url);
        setAvatarPath(uploadedAvatar.path);
        setAvatarFile(null);

        if (avatarPreview) {
          URL.revokeObjectURL(avatarPreview);
          setAvatarPreview("");
        }
      }

      const businessAccount = accountType === "ip" || accountType === "ooo";
      const safeDisplayName = businessAccount
        ? profile?.companyShortName || profile?.companyName || profile?.displayName || displayName
        : displayName.trim();

      await updateProfile(user, {
        displayName: safeDisplayName,
        photoURL: finalAvatarUrl || null,
      });

      await setDoc(
        doc(db, "users", user.uid),
        {
          uid: user.uid,
          email: user.email,
          displayName: safeDisplayName,
          city: city.trim(),
          phone: phone.trim(),
          avatarUrl: finalAvatarUrl,
          avatarPath: finalAvatarPath,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setMessage("Профиль сохранён.");
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Не получилось сохранить профиль."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteListing(id: string) {
    const ok = confirm("Удалить объявление? Фото из хранилища пока не удаляются.");

    if (!ok) return;

    await deleteDoc(doc(db, "listings", id));
  }

  async function handleDeleteRequest(id: string) {
    const ok = confirm("Удалить заявку заказчика?");
    if (!ok) return;
    await deleteDoc(doc(db, "customerRequests", id));
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-3 py-6 sm:px-5 sm:py-10">
        Загрузка...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-3 py-6 sm:px-5 sm:py-10">
        <div className="mx-auto max-w-xl rounded-[30px] bg-white p-8 text-center shadow-xl">
          <h1 className="text-2xl font-black text-gray-950 sm:text-3xl">
            Сначала войди в аккаунт
          </h1>

          <Link href="/auth" className="btn-primary mt-6 inline-block">
            Войти
          </Link>
        </div>
      </main>
    );
  }

  const shownAvatar = avatarPreview || avatarUrl;
  const businessAccount = accountType === "ip" || accountType === "ooo";
  const verificationApproved = profile?.verificationStatus === "approved";
  const verificationRejected = profile?.verificationStatus === "rejected";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f5f7fb] px-3 py-5 sm:px-5 sm:py-8">
      <style>{`
        @keyframes my-profile-enter {
          from { opacity: 0; transform: translateY(20px) scale(.992); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes my-profile-grid {
          from { background-position: 0 0, 0 0; }
          to { background-position: 48px 32px, -48px 32px; }
        }
        @keyframes my-profile-glow {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: .18; }
          50% { transform: translate3d(-14px, 8px, 0) scale(1.08); opacity: .3; }
        }
        .my-profile-enter { animation: my-profile-enter .62s cubic-bezier(.22,1,.36,1) both; }
        .my-profile-blueprint {
          background-image: linear-gradient(rgba(255,255,255,.075) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.075) 1px, transparent 1px);
          background-size: 32px 32px;
          animation: my-profile-grid 18s linear infinite;
        }
        .my-profile-glow { animation: my-profile-glow 7s ease-in-out infinite; }
        .my-profile-card { transition: transform .35s ease, box-shadow .35s ease, border-color .35s ease; }
        .my-profile-card:hover { transform: translateY(-3px); box-shadow: 0 22px 55px rgba(15,23,42,.09); }
        .my-profile-action { position: relative; overflow: hidden; transition: transform .26s ease, box-shadow .26s ease, background-color .26s ease; }
        .my-profile-action::after { content: ""; position: absolute; inset: 0; transform: translateX(-120%) skewX(-18deg); background: linear-gradient(90deg, transparent, rgba(255,255,255,.28), transparent); transition: transform .55s ease; }
        .my-profile-action:hover { transform: translateY(-2px); box-shadow: 0 16px 34px rgba(0,87,255,.22); }
        .my-profile-action:hover::after { transform: translateX(120%) skewX(-18deg); }
        .my-profile-action:active { transform: scale(.975); }
        @media (prefers-reduced-motion: reduce) {
          .my-profile-enter, .my-profile-blueprint, .my-profile-glow { animation: none !important; }
          .my-profile-card, .my-profile-action { transition: none !important; }
        }
      `}</style>

      <div className="pointer-events-none absolute -left-32 top-48 h-96 w-96 rounded-full bg-blue-200/30 blur-[90px]" />
      <div className="pointer-events-none absolute -right-36 top-[55%] h-[430px] w-[430px] rounded-full bg-cyan-200/25 blur-[100px]" />

      <div className="relative mx-auto max-w-7xl">
        <div className="my-profile-enter relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#004bdc] via-[#0057ff] to-[#397eff] p-5 sm:rounded-[34px] sm:p-8 text-white shadow-xl shadow-blue-900/15">
          <div className="my-profile-blueprint pointer-events-none absolute inset-0" />
          <div className="my-profile-glow pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-white" />
          <span className="pointer-events-none absolute bottom-7 right-8 h-14 w-14 border-b-2 border-r-2 border-[#ffd233]/75" />
          <div className="relative">
          <p className="font-black text-[#ffd233]">Личный кабинет</p>

          <h1 className="mt-3 text-3xl font-black sm:text-4xl md:text-5xl">
            Мой профиль
          </h1>

          <p className="mt-3 max-w-2xl text-blue-50">
            Управляй данными профиля, анкетами исполнителя и заявками заказчика.
          </p>
          </div>
        </div>

        <div className="my-profile-enter mt-6" style={{ animationDelay: "80ms" }}>
          <ProfileTools />
        </div>

        <div className="mt-5 grid gap-5 sm:mt-6 sm:gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <form
            onSubmit={handleSave}
            className="my-profile-enter my-profile-card h-fit rounded-[24px] border border-white bg-white p-4 shadow-sm sm:rounded-[30px] sm:p-6 lg:sticky lg:top-24"
            style={{ animationDelay: "150ms" }}
          >
            <h2 className="text-2xl font-black text-gray-950">
              Данные профиля
            </h2>

            <div className="mt-5 flex flex-col items-center rounded-[22px] bg-blue-50/60 p-4 sm:mt-6 sm:rounded-[28px] sm:p-5">
              <div className="relative">
                <div className="flex h-28 w-28 items-center sm:h-32 sm:w-32 justify-center overflow-hidden rounded-full bg-white text-[#0057ff] shadow-lg">
                  {shownAvatar ? (
                    <img
                      src={shownAvatar}
                      alt="Фото профиля"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <UserRound size={54} />
                  )}
                </div>

                <label className="absolute bottom-0 right-0 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-[#0057ff] text-white shadow-lg transition hover:scale-105">
                  <Camera size={20} />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </label>
              </div>

              <p className="mt-4 text-center text-sm font-bold text-gray-500">
                Нажми на синюю кнопку, чтобы выбрать фото профиля.
              </p>

              {avatarFile && (
                <p className="mt-2 text-center text-sm font-black text-[#0057ff]">
                  Новое фото выбрано. Нажми «Сохранить профиль».
                </p>
              )}
            </div>

            <div className="mt-6 space-y-4">
              <div className="relative">
                <UserRound
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                  size={20}
                />
                <input
                  className="input"
                  style={{ paddingLeft: "58px" }}
                  placeholder={businessAccount ? "Официальное название" : "Имя исполнителя"}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={businessAccount}
                />
              </div>

              <div className="relative">
                <Mail
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                  size={20}
                />
                <input
                  className="input"
                  style={{ paddingLeft: "58px" }}
                  value={user.email || ""}
                  disabled
                />
              </div>

              <div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { value: "individual", label: "Физлицо" },
                    { value: "ip", label: "ИП" },
                    { value: "ooo", label: "ООО" },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      disabled
                      className={`cursor-not-allowed rounded-2xl border px-4 py-4 font-black ${
                        accountType === item.value
                          ? "border-[#0057ff] bg-blue-50 text-[#0057ff]"
                          : "border-gray-200 bg-gray-50 text-gray-400"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs font-bold leading-5 text-gray-500">
                  Тип аккаунта и реквизиты нельзя менять вручную после регистрации.
                </p>
              </div>

              {businessAccount && (
                <div className="rounded-[24px] border border-blue-100 bg-blue-50/60 p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#0057ff] shadow-sm">
                      <Building2 size={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-gray-950">{companyName || profile?.companyOfficialName}</p>
                      <p className="mt-1 text-sm font-bold text-gray-500">
                        ИНН {profile?.companyInn || "—"} · ОГРН {profile?.companyOgrn || "—"}
                      </p>
                      {profile?.companyKpp && (
                        <p className="mt-1 text-sm font-bold text-gray-500">КПП {profile.companyKpp}</p>
                      )}
                    </div>
                  </div>

                  <div className={`mt-4 flex items-center gap-2 rounded-2xl p-3 text-sm font-black ${
                    verificationApproved
                      ? "bg-emerald-100 text-emerald-700"
                      : verificationRejected
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                  }`}>
                    {verificationApproved ? <BadgeCheck size={18} /> : <Clock3 size={18} />}
                    {verificationApproved
                      ? "Организация подтверждена"
                      : verificationRejected
                      ? "Проверка отклонена"
                      : "Организация ожидает подтверждения владельца"}
                  </div>
                </div>
              )}

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

            {message && (
              <p className="mt-5 rounded-2xl bg-blue-50 p-4 text-sm font-black text-[#0057ff]">
                {message}
              </p>
            )}

            <button
              disabled={saving}
              className="my-profile-action mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0057ff] px-5 py-4 text-lg font-black text-white disabled:opacity-70"
            >
              {saving ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Сохраняем...
                </>
              ) : (
                <>
                  <Save size={20} />
                  Сохранить профиль
                </>
              )}
            </button>
          </form>

          <section className="my-profile-enter my-profile-card rounded-[24px] border border-white bg-white p-4 shadow-sm sm:rounded-[30px] sm:p-6" style={{ animationDelay: "220ms" }}>
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h2 className="text-2xl font-black text-gray-950 sm:text-3xl">
                  Мои публикации
                </h2>
                <p className="mt-2 text-gray-500">
                  Анкеты исполнителя: {listings.length} · Заявки заказчика: {requests.length}
                </p>
              </div>

              <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap">
                <Link
                  href="/post/new"
                  className="my-profile-action flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0057ff] px-4 py-3 sm:inline-flex sm:w-auto text-sm font-black text-white"
                >
                  <HardHat size={18} />
                  Анкета исполнителя
                </Link>
                <Link
                  href="/requests/new"
                  className="my-profile-action flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 sm:inline-flex sm:w-auto text-sm font-black text-white"
                >
                  <Plus size={18} />
                  Заявка заказчика
                </Link>
              </div>
            </div>

            <div className="mt-6 grid w-full grid-cols-2 rounded-2xl bg-gray-100 p-1.5 sm:inline-flex sm:w-auto">
              <button
                type="button"
                onClick={() => setPublicationTab("listings")}
                className={`flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-3 text-xs font-black transition sm:gap-2 sm:px-4 sm:text-sm ${
                  publicationTab === "listings"
                    ? "bg-[#0057ff] text-white shadow-lg"
                    : "text-gray-500 hover:text-[#0057ff]"
                }`}
              >
                <HardHat size={18} />
                Исполнитель ({listings.length})
              </button>
              <button
                type="button"
                onClick={() => setPublicationTab("requests")}
                className={`flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-3 text-xs font-black transition sm:gap-2 sm:px-4 sm:text-sm ${
                  publicationTab === "requests"
                    ? "bg-[#0057ff] text-white shadow-lg"
                    : "text-gray-500 hover:text-[#0057ff]"
                }`}
              >
                <ClipboardList size={18} />
                Заказчик ({requests.length})
              </button>
            </div>

            {publicationTab === "listings" ? (
              listings.length === 0 ? (
                <div className="mt-6 rounded-[22px] border border-dashed border-blue-200 bg-blue-50/50 p-6 text-center sm:mt-8 sm:rounded-[26px] sm:p-10">
                  <h3 className="text-2xl font-black text-gray-950">
                    У тебя пока нет анкет исполнителя
                  </h3>
                  <p className="mt-2 text-gray-500">
                    Создай первую анкету, и она появится здесь.
                  </p>
                </div>
              ) : (
                <div className="mt-8 grid gap-5 xl:grid-cols-2">
                  {listings.map((listing) => (
                    <div key={listing.id} className="relative">
                      <ListingCard listing={listing} />
                      <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
                        <p className="text-sm font-black text-[#0057ff]">
                          {moderationLabel(listing.moderationStatus)}
                        </p>
                        {listing.moderationReason ? (
                          <p className="mt-1 text-sm font-semibold text-gray-600">
                            Причина: {listing.moderationReason}
                          </p>
                        ) : null}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Link
                          href={`/listing/${listing.id}/edit`}
                          className="flex-1 rounded-2xl bg-[#0057ff] px-4 py-3 text-center text-sm font-black text-white transition hover:bg-[#004de6] active:scale-[0.98]"
                        >
                          Редактировать
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDeleteListing(listing.id)}
                          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500 transition hover:bg-red-100 active:scale-90"
                          title="Удалить объявление"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : requests.length === 0 ? (
              <div className="mt-6 rounded-[22px] border border-dashed border-blue-200 bg-blue-50/50 p-6 text-center sm:mt-8 sm:rounded-[26px] sm:p-10">
                <h3 className="text-2xl font-black text-gray-950">
                  У тебя пока нет заявок заказчика
                </h3>
                <p className="mt-2 text-gray-500">
                  Опиши задачу, бюджет и сроки — заявка появится здесь и в мобильном приложении.
                </p>
              </div>
            ) : (
              <div className="mt-8 grid gap-5 xl:grid-cols-2">
                {requests.map((request) => (
                  <div key={request.id}>
                    <CustomerRequestCard request={request} />
                    <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
                      <p className="text-sm font-black text-[#0057ff]">
                        {moderationLabel(request.moderationStatus)}
                      </p>
                      {request.moderationReason ? (
                        <p className="mt-1 text-sm font-semibold text-gray-600">
                          Причина: {request.moderationReason}
                        </p>
                      ) : null}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Link
                        href={`/requests/${request.id}/edit`}
                        className="flex-1 rounded-2xl bg-[#0057ff] px-4 py-3 text-center text-sm font-black text-white transition hover:bg-[#004de6] active:scale-[0.98]"
                      >
                        Редактировать
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteRequest(request.id)}
                        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500 transition hover:bg-red-100 active:scale-90"
                        title="Удалить заявку"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
