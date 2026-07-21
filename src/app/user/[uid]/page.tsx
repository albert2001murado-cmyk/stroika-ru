"use client";

import { useAuth } from "@/components/AuthProvider";
import CustomerRequestCard from "@/components/CustomerRequestCard";
import { ListingCard } from "@/components/ListingCard";
import VerifiedBadge from "@/components/VerifiedBadge";
import { db } from "@/lib/firebase";
import { firestoreDateToMillis } from "@/types";
import type { CustomerRequest, Listing, UserProfile } from "@/types";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarCheck2,
  CalendarDays,
  Clock3,
  Edit3,
  FileText,
  GitCompareArrows,
  Hash,
  Images,
  Landmark,
  Mail,
  MapPin,
  MapPinned,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import {
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
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type PortfolioItem = {
  id: string;
  title: string;
  description?: string;
  city?: string;
  imageUrls?: string[];
  createdAt?: unknown;
};

type AvailabilityDay = {
  id: string;
  date: string;
  status: "free" | "busy";
};

function accountText(profile?: UserProfile | null) {
  if (profile?.accountType === "ip") return "Индивидуальный предприниматель";
  if (profile?.accountType === "ooo") return "Общество с ограниченной ответственностью";
  return "Физическое лицо";
}

function accountShortText(profile?: UserProfile | null) {
  if (profile?.accountType === "ip") return "ИП";
  if (profile?.accountType === "ooo") return "ООО";
  return "Физлицо";
}

function registryStatusMeta(status?: UserProfile["companyRegistryStatus"]) {
  switch (status) {
    case "ACTIVE":
      return {
        label: "Организация действует",
        className: "bg-emerald-50 text-emerald-700 ring-emerald-100",
      };
    case "LIQUIDATING":
      return {
        label: "В процессе ликвидации",
        className: "bg-amber-50 text-amber-700 ring-amber-100",
      };
    case "LIQUIDATED":
      return {
        label: "Организация ликвидирована",
        className: "bg-red-50 text-red-700 ring-red-100",
      };
    case "BANKRUPT":
      return {
        label: "Процедура банкротства",
        className: "bg-red-50 text-red-700 ring-red-100",
      };
    case "REORGANIZING":
      return {
        label: "В процессе реорганизации",
        className: "bg-amber-50 text-amber-700 ring-amber-100",
      };
    default:
      return {
        label: "Статус реестра не указан",
        className: "bg-slate-100 text-slate-600 ring-slate-200",
      };
  }
}

function formatPhone(value?: string) {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");

  if (digits.length === 11) {
    const normalized = digits.startsWith("8") ? `7${digits.slice(1)}` : digits;
    return `+${normalized[0]} (${normalized.slice(1, 4)}) ${normalized.slice(
      4,
      7
    )}-${normalized.slice(7, 9)}-${normalized.slice(9, 11)}`;
  }

  return value;
}

export default function PublicUserPage() {
  const params = useParams();
  const uid = String(params?.uid || "");
  const { user } = useAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [publicationTab, setPublicationTab] = useState<"listings" | "requests">(
    "listings"
  );
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [availability, setAvailability] = useState<AvailabilityDay[]>([]);
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileMissing, setProfileMissing] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      setProfileMissing(true);
      return;
    }

    let active = true;

    getDoc(doc(db, "users", uid))
      .then((snapshot) => {
        if (!active) return;

        if (snapshot.exists()) {
          setProfile({
            uid: snapshot.id,
            ...snapshot.data(),
          } as UserProfile);
        } else {
          setProfileMissing(true);
        }
      })
      .catch((error) => {
        console.error("Не получилось загрузить публичный профиль:", error);
        if (active) setProfileMissing(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const unsubscribeListings = onSnapshot(
      query(collection(db, "listings"), where("authorId", "==", uid)),
      (snapshot) => {
        const data = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as Listing[];

        data.sort(
          (first, second) =>
            firestoreDateToMillis(second.createdAt) -
            firestoreDateToMillis(first.createdAt)
        );

        setListings(data);
      },
      (error) => {
        console.error("Не получилось загрузить объявления:", error);
      }
    );

    const unsubscribeRequests = onSnapshot(
      query(collection(db, "customerRequests"), where("customerId", "==", uid)),
      (snapshot) => {
        const data = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as CustomerRequest[];

        data.sort(
          (first, second) =>
            firestoreDateToMillis(second.createdAt) -
            firestoreDateToMillis(first.createdAt)
        );

        setRequests(data);
      },
      (error) => {
        console.error("Не получилось загрузить заявки заказчика:", error);
      }
    );

    const unsubscribePortfolio = onSnapshot(
      query(collection(db, "portfolio"), where("userId", "==", uid)),
      (snapshot) => {
        const data = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as PortfolioItem[];

        data.sort(
          (first, second) =>
            firestoreDateToMillis(second.createdAt) -
            firestoreDateToMillis(first.createdAt)
        );

        setPortfolio(data);
      },
      (error) => {
        console.error("Не получилось загрузить портфолио:", error);
      }
    );

    const unsubscribeAvailability = onSnapshot(
      collection(db, "availability", uid, "days"),
      (snapshot) => {
        setAvailability(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })) as AvailabilityDay[]
        );
      },
      (error) => {
        console.error("Не получилось загрузить занятость:", error);
      }
    );

    return () => {
      active = false;
      unsubscribeListings();
      unsubscribeRequests();
      unsubscribePortfolio();
      unsubscribeAvailability();
    };
  }, [uid]);

  useEffect(() => {
    if (!user) return;

    return onSnapshot(
      doc(db, "comparisonSelections", user.uid),
      (snapshot) => {
        setComparisonIds((snapshot.data()?.userIds || []).slice(0, 3));
      },
      (error) => {
        console.error("Не получилось загрузить сравнение:", error);
      }
    );
  }, [user]);

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);

    return availability
      .filter((item) => item.date >= today)
      .sort((first, second) => first.date.localeCompare(second.date))
      .slice(0, 14);
  }, [availability]);

  const freeDaysCount = upcoming.filter((item) => item.status === "free").length;
  const isOwner = Boolean(user && user.uid === uid);
  const isBusiness =
    profile?.accountType === "ip" || profile?.accountType === "ooo";
  const isVerified = Boolean(
    profile?.verified ||
      profile?.isVerified ||
      profile?.verificationStatus === "approved"
  );
  const isPendingVerification = profile?.verificationStatus === "pending";
  const isCompared = comparisonIds.includes(uid);
  const avatarUrl = profile?.avatarUrl || profile?.photoURL || "";
  const businessName =
    profile?.companyOfficialName ||
    profile?.companyShortName ||
    profile?.companyName ||
    "";
  const registryStatus = registryStatusMeta(profile?.companyRegistryStatus);

  const companyDetails = [
    {
      label: "ИНН",
      value: profile?.companyInn,
      icon: Hash,
    },
    {
      label: profile?.accountType === "ip" ? "ОГРНИП" : "ОГРН",
      value: profile?.companyOgrn,
      icon: FileText,
    },
    {
      label: "КПП",
      value: profile?.accountType === "ooo" ? profile?.companyKpp : undefined,
      icon: Landmark,
    },
    {
      label: "Юридический адрес",
      value: profile?.companyLegalAddress,
      icon: MapPinned,
    },
  ].filter((item) => Boolean(item.value));

  async function toggleCompare() {
    if (!user || user.uid === uid || compareLoading) return;

    setCompareLoading(true);

    try {
      const next = isCompared
        ? comparisonIds.filter((item) => item !== uid)
        : [...comparisonIds, uid].slice(0, 3);

      await setDoc(
        doc(db, "comparisonSelections", user.uid),
        {
          userIds: next,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error("Не получилось изменить список сравнения:", error);
    } finally {
      setCompareLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="app-page">
        <div className="app-container max-w-7xl">
          <div className="animate-pulse overflow-hidden rounded-[36px] bg-white shadow-sm">
            <div className="h-52 bg-blue-100" />
            <div className="space-y-4 p-8">
              <div className="h-10 w-72 rounded-2xl bg-slate-100" />
              <div className="h-5 w-48 rounded-xl bg-slate-100" />
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="h-20 rounded-2xl bg-slate-100" />
                <div className="h-20 rounded-2xl bg-slate-100" />
                <div className="h-20 rounded-2xl bg-slate-100" />
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (profileMissing || !profile) {
    return (
      <main className="app-page">
        <div className="app-container max-w-2xl">
          <section className="rounded-[34px] bg-white p-10 text-center shadow-xl shadow-slate-900/5">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[26px] bg-blue-50 text-[#0057ff]">
              <UserRound size={38} />
            </div>
            <h1 className="mt-6 text-3xl font-black text-slate-950">
              Профиль не найден
            </h1>
            <p className="mt-3 text-slate-500">
              Возможно, пользователь удалил аккаунт или ссылка устарела.
            </p>
            <Link href="/" className="btn-primary mt-7">
              Вернуться на главную
            </Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="app-page overflow-hidden">
      <style>{`
        @keyframes public-profile-reveal {
          from {
            opacity: 0;
            transform: translateY(22px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes public-profile-float {
          0%, 100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(0, -12px, 0) scale(1.04);
          }
        }

        .public-profile-reveal {
          animation: public-profile-reveal 0.65s cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .public-profile-float {
          animation: public-profile-float 7s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .public-profile-reveal,
          .public-profile-float {
            animation: none !important;
          }
        }
      `}</style>

      <div className="app-container max-w-7xl">
        <section className="public-profile-reveal relative overflow-hidden rounded-[38px] bg-white shadow-[0_26px_80px_rgba(15,23,42,0.10)] ring-1 ring-slate-200/70">
          <div className="relative min-h-[250px] overflow-hidden bg-gradient-to-br from-[#0048dc] via-[#0057ff] to-[#3482ff] px-5 pb-24 pt-7 text-white sm:px-10 sm:pb-28 sm:pt-10">
            <div className="public-profile-float pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10 blur-[1px]" />
            <div
              className="public-profile-float pointer-events-none absolute -bottom-36 left-[18%] h-72 w-72 rounded-full bg-cyan-300/15"
              style={{ animationDelay: "-2.5s" }}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-blue-950/10 via-transparent to-white/5" />

            <div className="relative flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/13 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] ring-1 ring-white/20 backdrop-blur-md">
                <Sparkles size={15} />
                Публичный профиль
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isOwner ? (
                  <Link
                    href="/profile"
                    className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-black text-[#0057ff] shadow-lg shadow-blue-950/15 transition duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:bg-blue-50 active:scale-[0.97]"
                  >
                    <Edit3 size={17} />
                    Редактировать профиль
                  </Link>
                ) : null}

                {user && !isOwner ? (
                  <button
                    type="button"
                    onClick={toggleCompare}
                    disabled={compareLoading}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-2xl px-4 py-2 text-sm font-black shadow-lg transition duration-300 hover:-translate-y-1 hover:scale-[1.02] active:scale-[0.97] disabled:cursor-wait disabled:opacity-70 ${
                      isCompared
                        ? "bg-[#ffd233] text-slate-950 shadow-amber-950/10"
                        : "bg-white/14 text-white ring-1 ring-white/20 backdrop-blur-md hover:bg-white/20"
                    }`}
                  >
                    <GitCompareArrows size={17} />
                    {compareLoading
                      ? "Сохраняем..."
                      : isCompared
                      ? "В сравнении"
                      : "Сравнить"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="relative -mt-20 px-5 pb-7 sm:-mt-24 sm:px-10 sm:pb-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end">
              <div className="group relative h-36 w-36 shrink-0 overflow-hidden rounded-[34px] bg-white p-1.5 shadow-[0_20px_45px_rgba(15,23,42,0.22)] ring-1 ring-white sm:h-44 sm:w-44">
                <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[28px] bg-blue-50 text-[#0057ff]">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={profile.displayName || "Пользователь"}
                      className="h-full w-full object-cover transition duration-700 group-hover:scale-110"
                    />
                  ) : (
                    <UserRound size={58} />
                  )}
                </div>
              </div>

              <div className="min-w-0 flex-1 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-[#0057ff] ring-1 ring-blue-100">
                    <BriefcaseBusiness size={15} />
                    {accountShortText(profile)}
                  </span>

                  {isVerified ? <VerifiedBadge size="md" /> : null}

                  {isPendingVerification ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700 ring-1 ring-amber-100">
                      <Clock3 size={15} />
                      Проверка реквизитов
                    </span>
                  ) : null}
                </div>

                <h1 className="mt-4 break-words text-4xl font-black tracking-[-0.04em] text-slate-950 sm:text-5xl">
                  {profile.displayName || profile.name || "Пользователь"}
                </h1>

                {isBusiness && businessName ? (
                  <p className="mt-2 max-w-3xl text-lg font-extrabold leading-7 text-slate-600">
                    {businessName}
                  </p>
                ) : (
                  <p className="mt-2 flex items-center gap-2 font-bold text-slate-500">
                    <BriefcaseBusiness size={18} />
                    {accountText(profile)}
                  </p>
                )}
              </div>

              {!isOwner ? (
                <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2 lg:min-w-[360px]">
                  <Link
                    href={user ? `/messages/${uid}` : "/auth"}
                    className="group inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#0057ff] px-5 text-sm font-black text-white shadow-lg shadow-blue-600/25 transition duration-300 hover:-translate-y-1 hover:bg-[#004de6] hover:shadow-[0_18px_40px_rgba(0,87,255,0.30)] active:scale-[0.97]"
                  >
                    <MessageCircle
                      size={20}
                      className="transition duration-300 group-hover:-rotate-6 group-hover:scale-110"
                    />
                    {user ? "Написать" : "Войти и написать"}
                  </Link>

                  {profile.phone ? (
                    <a
                      href={`tel:${profile.phone.replace(/[^\d+]/g, "")}`}
                      className="group inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#ffd233] px-5 text-sm font-black text-slate-950 shadow-lg shadow-amber-400/20 transition duration-300 hover:-translate-y-1 hover:bg-[#ffca0a] hover:shadow-[0_18px_40px_rgba(245,158,11,0.22)] active:scale-[0.97]"
                    >
                      <Phone
                        size={20}
                        className="transition duration-300 group-hover:rotate-[-8deg] group-hover:scale-110"
                      />
                      Позвонить
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {profile.city ? (
                <div className="group flex min-h-20 items-center gap-3 rounded-[22px] bg-slate-50 px-4 py-3 ring-1 ring-slate-100 transition duration-300 hover:-translate-y-1 hover:bg-blue-50 hover:shadow-lg">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#0057ff] shadow-sm transition duration-300 group-hover:scale-110">
                    <MapPin size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-slate-400">
                      Город
                    </span>
                    <span className="mt-1 block truncate font-black text-slate-950">
                      {profile.city}
                    </span>
                  </span>
                </div>
              ) : null}

              {profile.phone ? (
                <a
                  href={`tel:${profile.phone.replace(/[^\d+]/g, "")}`}
                  className="group flex min-h-20 items-center gap-3 rounded-[22px] bg-slate-50 px-4 py-3 ring-1 ring-slate-100 transition duration-300 hover:-translate-y-1 hover:bg-blue-50 hover:shadow-lg"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#0057ff] shadow-sm transition duration-300 group-hover:scale-110">
                    <Phone size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-slate-400">
                      Телефон
                    </span>
                    <span className="mt-1 block truncate font-black text-slate-950">
                      {formatPhone(profile.phone)}
                    </span>
                  </span>
                </a>
              ) : null}

              {profile.email ? (
                <a
                  href={`mailto:${profile.email}`}
                  className="group flex min-h-20 items-center gap-3 rounded-[22px] bg-slate-50 px-4 py-3 ring-1 ring-slate-100 transition duration-300 hover:-translate-y-1 hover:bg-blue-50 hover:shadow-lg"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#0057ff] shadow-sm transition duration-300 group-hover:scale-110">
                    <Mail size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-slate-400">
                      Электронная почта
                    </span>
                    <span className="mt-1 block truncate font-black text-slate-950">
                      {profile.email}
                    </span>
                  </span>
                </a>
              ) : null}

              <div className="group flex min-h-20 items-center gap-3 rounded-[22px] bg-slate-50 px-4 py-3 ring-1 ring-slate-100 transition duration-300 hover:-translate-y-1 hover:bg-blue-50 hover:shadow-lg">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#0057ff] shadow-sm transition duration-300 group-hover:scale-110">
                  <ShieldCheck size={20} />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-slate-400">
                    Статус профиля
                  </span>
                  <span className="mt-1 block truncate font-black text-slate-950">
                    {isVerified
                      ? "Подтверждён"
                      : isPendingVerification
                      ? "На проверке"
                      : "Не подтверждён"}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </section>

        <section
          className="public-profile-reveal mt-6 grid gap-4 sm:grid-cols-3"
          style={{ animationDelay: "90ms" }}
        >
          {[
            {
              label: "Активных публикаций",
              value: listings.length + requests.length,
              icon: BriefcaseBusiness,
            },
            {
              label: "Работ в портфолио",
              value: portfolio.length,
              icon: Images,
            },
            {
              label: "Свободных ближайших дней",
              value: freeDaysCount,
              icon: CalendarCheck2,
            },
          ].map((item) => {
            const Icon = item.icon;

            return (
              <article
                key={item.label}
                className="group rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200/70 transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_45px_rgba(15,23,42,0.10)]"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0057ff] transition duration-300 group-hover:rotate-[-5deg] group-hover:scale-110">
                    <Icon size={23} />
                  </span>
                  <span className="text-4xl font-black tracking-[-0.05em] text-slate-950">
                    {item.value}
                  </span>
                </div>
                <p className="mt-5 font-bold text-slate-500">{item.label}</p>
              </article>
            );
          })}
        </section>

        {isBusiness ? (
          <section
            className="public-profile-reveal relative mt-6 overflow-hidden rounded-[34px] bg-white p-5 shadow-sm ring-1 ring-slate-200/70 sm:p-8"
            style={{ animationDelay: "160ms" }}
          >
            <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-blue-50" />

            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0057ff] text-white shadow-lg shadow-blue-600/20">
                    <Building2 size={24} />
                  </span>

                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0057ff]">
                      Реквизиты {accountShortText(profile)}
                    </p>
                    <h2 className="mt-1 text-2xl font-black text-slate-950 sm:text-3xl">
                      Официальные данные
                    </h2>
                  </div>
                </div>

                <h3 className="mt-6 break-words text-2xl font-black leading-tight text-slate-950 sm:text-3xl">
                  {businessName || "Название организации не указано"}
                </h3>

                {profile.companyManagementName ? (
                  <p className="mt-3 text-sm font-bold leading-6 text-slate-500">
                    {profile.companyManagementPost || "Руководитель"}:{" "}
                    <span className="text-slate-800">
                      {profile.companyManagementName}
                    </span>
                  </p>
                ) : null}
              </div>

              <span
                className={`relative inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 text-xs font-black ring-1 ${registryStatus.className}`}
              >
                <ShieldCheck size={16} />
                {registryStatus.label}
              </span>
            </div>

            {companyDetails.length > 0 ? (
              <div className="relative mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {companyDetails.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.label}
                      className="group min-w-0 rounded-[24px] bg-slate-50 p-4 ring-1 ring-slate-100 transition duration-300 hover:-translate-y-1 hover:bg-blue-50 hover:shadow-lg"
                    >
                      <div className="flex items-center gap-2 text-[#0057ff]">
                        <Icon size={18} />
                        <span className="text-xs font-black uppercase tracking-[0.08em]">
                          {item.label}
                        </span>
                      </div>
                      <p className="mt-3 break-words text-sm font-black leading-6 text-slate-950">
                        {item.value}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="relative mt-7 rounded-[24px] bg-slate-50 p-5 font-bold text-slate-500 ring-1 ring-slate-100">
                Реквизиты организации пока не добавлены.
              </div>
            )}
          </section>
        ) : null}

        {profile.about ? (
          <section
            className="public-profile-reveal mt-6 rounded-[34px] bg-white p-6 shadow-sm ring-1 ring-slate-200/70 sm:p-8"
            style={{ animationDelay: "230ms" }}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0057ff]">
                <FileText size={23} />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0057ff]">
                  О специалисте
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  О себе и опыте
                </h2>
              </div>
            </div>
            <p className="mt-5 whitespace-pre-line text-base font-medium leading-8 text-slate-600">
              {profile.about}
            </p>
          </section>
        ) : null}

        <section
          className="public-profile-reveal mt-6 rounded-[34px] bg-white p-5 shadow-sm ring-1 ring-slate-200/70 sm:p-8"
          style={{ animationDelay: "300ms" }}
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0057ff]">
                <CalendarDays size={23} />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0057ff]">
                  Календарь
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  Ближайшая занятость
                </h2>
              </div>
            </div>

            <p className="text-sm font-bold text-slate-400">
              Данные синхронизированы с приложением
            </p>
          </div>

          {upcoming.length === 0 ? (
            <div className="mt-6 flex flex-col items-center rounded-[26px] bg-slate-50 px-5 py-9 text-center ring-1 ring-slate-100">
              <CalendarDays size={34} className="text-blue-200" />
              <p className="mt-3 font-black text-slate-700">
                Расписание пока не указано
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Исполнитель ещё не отметил свободные и занятые дни.
              </p>
            </div>
          ) : (
            <div className="mt-6 flex gap-3 overflow-x-auto pb-3">
              {upcoming.map((item, index) => (
                <div
                  key={item.id}
                  className={`group min-w-[122px] rounded-[24px] px-4 py-4 text-center font-black ring-1 transition duration-300 hover:-translate-y-1 hover:shadow-lg ${
                    item.status === "free"
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                      : "bg-rose-50 text-rose-700 ring-rose-100"
                  }`}
                  style={{ transitionDelay: `${Math.min(index * 20, 160)}ms` }}
                >
                  <p className="text-lg">
                    {new Intl.DateTimeFormat("ru-RU", {
                      day: "2-digit",
                      month: "short",
                    }).format(new Date(`${item.date}T12:00:00`))}
                  </p>
                  <p className="mt-1 text-xs">
                    {item.status === "free" ? "Свободен" : "Занят"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section
          className="public-profile-reveal mt-9"
          style={{ animationDelay: "360ms" }}
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0057ff]">
                Выполненные работы
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950 sm:text-4xl">
                Портфолио
              </h2>
            </div>
            <p className="font-bold text-slate-400">
              Работ: {portfolio.length}
            </p>
          </div>

          {portfolio.length === 0 ? (
            <div className="mt-5 rounded-[32px] bg-white px-6 py-12 text-center shadow-sm ring-1 ring-dashed ring-blue-200">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-blue-50 text-[#0057ff]">
                <Images size={30} />
              </div>
              <h3 className="mt-5 text-2xl font-black text-slate-950">
                Работ пока нет
              </h3>
              <p className="mt-2 text-slate-500">
                Исполнитель ещё не добавил примеры выполненных объектов.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {portfolio.map((item, index) => (
                <article
                  key={item.id}
                  className="group overflow-hidden rounded-[28px] bg-white shadow-sm ring-1 ring-slate-200/70 transition duration-500 hover:-translate-y-2 hover:shadow-[0_24px_60px_rgba(15,23,42,0.14)]"
                  style={{ animationDelay: `${400 + index * 45}ms` }}
                >
                  <div className="relative h-56 overflow-hidden bg-blue-50">
                    {item.imageUrls?.[0] ? (
                      <img
                        src={item.imageUrls[0]}
                        alt={item.title}
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-110"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-2xl font-black text-blue-200">
                        Стройка.ру
                      </div>
                    )}

                    {item.imageUrls && item.imageUrls.length > 1 ? (
                      <span className="absolute right-3 top-3 rounded-full bg-slate-950/70 px-3 py-1.5 text-xs font-black text-white backdrop-blur-md">
                        {item.imageUrls.length} фото
                      </span>
                    ) : null}

                    <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/45 to-transparent opacity-0 transition duration-500 group-hover:opacity-100" />
                  </div>

                  <div className="p-5">
                    <h3 className="text-xl font-black text-slate-950">
                      {item.title}
                    </h3>

                    {item.city ? (
                      <p className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-500">
                        <MapPin size={16} className="text-[#0057ff]" />
                        {item.city}
                      </p>
                    ) : null}

                    {item.description ? (
                      <p className="mt-3 line-clamp-3 text-sm font-medium leading-6 text-slate-500">
                        {item.description}
                      </p>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section
          className="public-profile-reveal mt-10"
          style={{ animationDelay: "430ms" }}
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0057ff]">
                Публикации пользователя
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950 sm:text-4xl">
                Объявления и заявки
              </h2>
              <p className="mt-2 font-medium text-slate-500">
                Предложения исполнителя и задачи, опубликованные как заказчиком.
              </p>
            </div>

            <div className="inline-flex w-full rounded-[22px] bg-white p-1.5 shadow-sm ring-1 ring-slate-200 sm:w-auto">
              <button
                type="button"
                onClick={() => setPublicationTab("listings")}
                className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[17px] px-4 text-sm font-black transition duration-300 sm:flex-none ${
                  publicationTab === "listings"
                    ? "bg-[#0057ff] text-white shadow-lg shadow-blue-600/20"
                    : "text-slate-500 hover:bg-blue-50 hover:text-[#0057ff]"
                }`}
              >
                <BriefcaseBusiness size={18} />
                Исполнитель
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    publicationTab === "listings"
                      ? "bg-white/18 text-white"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {listings.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPublicationTab("requests")}
                className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[17px] px-4 text-sm font-black transition duration-300 sm:flex-none ${
                  publicationTab === "requests"
                    ? "bg-[#0057ff] text-white shadow-lg shadow-blue-600/20"
                    : "text-slate-500 hover:bg-blue-50 hover:text-[#0057ff]"
                }`}
              >
                <FileText size={18} />
                Заказчик
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    publicationTab === "requests"
                      ? "bg-white/18 text-white"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {requests.length}
                </span>
              </button>
            </div>
          </div>

          <div className="mt-5">
            {publicationTab === "listings" ? (
              listings.length === 0 ? (
                <div className="rounded-[32px] bg-white px-6 py-12 text-center shadow-sm ring-1 ring-dashed ring-blue-200">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-blue-50 text-[#0057ff]">
                    <BriefcaseBusiness size={30} />
                  </div>
                  <h3 className="mt-5 text-2xl font-black text-slate-950">
                    Анкет исполнителя пока нет
                  </h3>
                  <p className="mt-2 text-slate-500">
                    Пользователь ещё не опубликовал предложения услуг.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex justify-end">
                    <Link
                      href={`/?author=${uid}`}
                      className="group inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#0057ff] shadow-sm ring-1 ring-slate-200 transition duration-300 hover:-translate-y-1 hover:shadow-lg"
                    >
                      Все предложения
                      <ArrowRight
                        size={17}
                        className="transition duration-300 group-hover:translate-x-1"
                      />
                    </Link>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                    {listings.map((listing) => (
                      <ListingCard key={listing.id} listing={listing} />
                    ))}
                  </div>
                </>
              )
            ) : requests.length === 0 ? (
              <div className="rounded-[32px] bg-white px-6 py-12 text-center shadow-sm ring-1 ring-dashed ring-blue-200">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-blue-50 text-[#0057ff]">
                  <FileText size={30} />
                </div>
                <h3 className="mt-5 text-2xl font-black text-slate-950">
                  Заявок заказчика пока нет
                </h3>
                <p className="mt-2 text-slate-500">
                  Пользователь ещё не публиковал задачи для исполнителей.
                </p>
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {requests.map((request) => (
                  <CustomerRequestCard key={request.id} request={request} />
                ))}
              </div>
            )}
          </div>
        </section>

        {!isOwner ? (
          <section
            className="public-profile-reveal mt-10 overflow-hidden rounded-[34px] bg-gradient-to-r from-[#0057ff] to-[#2f7fff] p-6 text-white shadow-[0_24px_60px_rgba(0,87,255,0.24)] sm:p-8"
            style={{ animationDelay: "500ms" }}
          >
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.14em] text-blue-100">
                  Связаться с исполнителем
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">
                  Обсудите задачу напрямую
                </h2>
                <p className="mt-3 max-w-2xl font-medium leading-7 text-blue-50">
                  Напишите сообщение или позвоните, чтобы уточнить стоимость,
                  сроки и детали работы.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Link
                  href={user ? `/messages/${uid}` : "/auth"}
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white px-6 font-black text-[#0057ff] shadow-lg transition duration-300 hover:-translate-y-1 hover:bg-blue-50 active:scale-[0.97]"
                >
                  <MessageCircle size={20} />
                  Написать
                </Link>

                {profile.phone ? (
                  <a
                    href={`tel:${profile.phone.replace(/[^\d+]/g, "")}`}
                    className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#ffd233] px-6 font-black text-slate-950 shadow-lg transition duration-300 hover:-translate-y-1 hover:bg-[#ffca0a] active:scale-[0.97]"
                  >
                    <Phone size={20} />
                    Позвонить
                  </a>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
