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
    <main className="min-h-screen bg-[#f5f7fb] px-5 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-[34px] bg-[#0057ff] p-8 text-white shadow-xl shadow-blue-900/15">
          <p className="font-black text-[#ffd233]">Личный кабинет</p>

          <h1 className="mt-3 text-4xl font-black md:text-5xl">
            Мой профиль
          </h1>

          <p className="mt-3 max-w-2xl text-blue-50">
            Управляй данными профиля, анкетами исполнителя и заявками заказчика.
          </p>
        </div>

        <div className="mt-6">
          <ProfileTools />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[420px_1fr]">
          <form
            onSubmit={handleSave}
            className="h-fit rounded-[30px] bg-white p-6 shadow-sm lg:sticky lg:top-24"
          >
            <h2 className="text-2xl font-black text-gray-950">
              Данные профиля
            </h2>

            <div className="mt-6 flex flex-col items-center rounded-[28px] bg-blue-50/60 p-5">
              <div className="relative">
                <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full bg-white text-[#0057ff] shadow-lg">
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
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0057ff] px-5 py-4 text-lg font-black text-white disabled:opacity-70"
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

          <section className="rounded-[30px] bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h2 className="text-3xl font-black text-gray-950">
                  Мои публикации
                </h2>
                <p className="mt-2 text-gray-500">
                  Анкеты исполнителя: {listings.length} · Заявки заказчика: {requests.length}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href="/post/new"
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#0057ff] px-4 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:shadow-lg active:scale-95"
                >
                  <HardHat size={18} />
                  Анкета исполнителя
                </Link>
                <Link
                  href="/requests/new"
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:shadow-lg active:scale-95"
                >
                  <Plus size={18} />
                  Заявка заказчика
                </Link>
              </div>
            </div>

            <div className="mt-6 inline-flex rounded-2xl bg-gray-100 p-1.5">
              <button
                type="button"
                onClick={() => setPublicationTab("listings")}
                className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition ${
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
                className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition ${
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
                <div className="mt-8 rounded-[26px] border border-dashed border-blue-200 bg-blue-50/50 p-10 text-center">
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
              <div className="mt-8 rounded-[26px] border border-dashed border-blue-200 bg-blue-50/50 p-10 text-center">
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
