"use client";

import CustomerRequestCard from "@/components/CustomerRequestCard";
import ListingCard from "@/components/ListingCard";
import NearbyWorkerButton from "@/components/NearbyWorkerButton";
import PremiumCategoryGrid from "@/components/PremiumCategoryGrid";
import { categories } from "@/data/categories";
import { db } from "@/lib/firebase";
import {
  matchesListingSearch,
  type SearchableListingFields,
} from "@/lib/listingOffer";
import type { CustomerRequest, Listing } from "@/types";
import { firestoreDateToMillis } from "@/types";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import {
  BadgeCheck,
  Banknote,
  Building2,
  ClipboardList,
  CreditCard,
  HardHat,
  Image as ImageIcon,
  MapPin,
  Search,
  SlidersHorizontal,
  UserRound,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type SearchableListing = Listing & SearchableListingFields;
type FeedMode = "contractors" | "customers";
type AccountTypeFilter = "" | "individual" | "ip" | "ooo";
type PaymentFilter = "" | "cash" | "transfer";

const POPULAR_CITIES = [
  "Москва",
  "Санкт-Петербург",
  "Нижний Новгород",
  "Казань",
  "Самара",
  "Екатеринбург",
  "Новосибирск",
  "Краснодар",
  "Ростов-на-Дону",
  "Уфа",
  "Пермь",
  "Челябинск",
];

function normalize(value: unknown) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/^г\.?\s*/i, "");
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.,-]/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function cityMatches(itemCity: unknown, selectedCity: string) {
  if (!selectedCity.trim()) return true;
  const item = normalize(itemCity);
  const selected = normalize(selectedCity);
  return Boolean(item) && (item === selected || item.includes(selected) || selected.includes(item));
}

function hasImages(item: Listing | CustomerRequest) {
  const imageUrls = Array.isArray(item.imageUrls) ? item.imageUrls : [];
  if (imageUrls.some(Boolean)) return true;

  if ("media" in item && Array.isArray(item.media)) {
    return item.media.some((mediaItem) => mediaItem?.type === "image" && mediaItem?.url);
  }

  return false;
}

function listingPriceRange(listing: Listing) {
  const from = toFiniteNumber(listing.priceFrom);
  const to = toFiniteNumber(listing.priceTo) ?? from;
  return { from, to };
}

function requestPriceRange(request: CustomerRequest) {
  const fallback = toFiniteNumber(request.budget);
  const from = toFiniteNumber(request.budgetFrom) ?? fallback;
  const to = toFiniteNumber(request.budgetTo) ?? fallback ?? from;
  return { from, to };
}

function overlapsPriceRange(
  itemFrom: number | null,
  itemTo: number | null,
  selectedFrom: number,
  selectedTo: number | null
) {
  const hasFilter = selectedFrom > 0 || selectedTo !== null;
  if (!hasFilter) return true;
  if (itemFrom === null && itemTo === null) return false;

  const normalizedFrom = itemFrom ?? itemTo ?? 0;
  const normalizedTo = itemTo ?? itemFrom ?? normalizedFrom;
  const upper = selectedTo ?? Number.POSITIVE_INFINITY;

  return normalizedTo >= selectedFrom && normalizedFrom <= upper;
}

function isListingVerified(listing: Listing) {
  return Boolean(
    listing.authorVerified ||
      listing.verified ||
      listing.isVerified ||
      listing.verificationStatus === "approved"
  );
}

function requestMatches(
  request: CustomerRequest,
  search: string,
  category: string,
  subcategory: string
) {
  const normalizedSearch = normalize(search);
  const haystack = [
    request.title,
    request.description,
    request.category,
    request.subcategory,
    request.city,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("ru-RU");

  const matchesText = normalizedSearch ? haystack.includes(normalizedSearch) : true;
  const matchesCategory = category
    ? request.category === category || haystack.includes(normalize(category))
    : true;
  const matchesSubcategory = subcategory
    ? request.subcategory === subcategory || haystack.includes(normalize(subcategory))
    : true;

  return request.status === "active" && matchesText && matchesCategory && matchesSubcategory;
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("ru-RU").format(Math.max(0, Math.round(value)));
}

function PriceRangeSlider({
  max,
  step,
  from,
  to,
  onChangeFrom,
  onChangeTo,
}: {
  max: number;
  step: number;
  from: number;
  to: number | null;
  onChangeFrom: (value: number) => void;
  onChangeTo: (value: number | null) => void;
}) {
  const safeMax = Math.max(max, step);
  const sliderTo = Math.min(Math.max(to ?? safeMax, from), safeMax);
  const sliderFrom = Math.min(Math.max(from, 0), sliderTo);
  const fromPercent = (sliderFrom / safeMax) * 100;
  const toPercent = (sliderTo / safeMax) * 100;

  return (
    <div className="rounded-[24px] border border-blue-100 bg-gradient-to-br from-blue-50/80 to-white p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.13em] text-[#0057ff]">
            Цена и бюджет
          </p>
          <p className="mt-1 text-sm font-bold text-gray-500">
            Передвиньте ползунки или впишите сумму вручную
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-gray-600 shadow-sm ring-1 ring-blue-100">
          до {formatPrice(safeMax)} ₽
        </span>
      </div>

      <div className="relative mt-5 h-9">
        <div className="absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-blue-100" />
        <div
          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#00aaff] to-[#0057ff] shadow-[0_4px_14px_rgba(0,87,255,0.28)] transition-[left,width] duration-300 ease-out"
          style={{
            left: `${fromPercent}%`,
            width: `${Math.max(0, toPercent - fromPercent)}%`,
          }}
        />

        <input
          type="range"
          min={0}
          max={safeMax}
          step={step}
          value={sliderFrom}
          onChange={(event) =>
            onChangeFrom(Math.min(Number(event.target.value), sliderTo))
          }
          aria-label="Минимальная цена"
          className={`pointer-events-none absolute inset-0 z-20 h-9 w-full appearance-none bg-transparent outline-none
            [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:bg-transparent
            [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:mt-[-7px]
            [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6
            [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[5px]
            [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[#0057ff]
            [&::-webkit-slider-thumb]:shadow-[0_5px_18px_rgba(0,87,255,0.38)]
            [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-200
            active:[&::-webkit-slider-thumb]:cursor-grabbing active:[&::-webkit-slider-thumb]:scale-125
            [&::-moz-range-track]:h-2 [&::-moz-range-track]:bg-transparent
            [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4
            [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:border-[5px] [&::-moz-range-thumb]:border-white
            [&::-moz-range-thumb]:bg-[#0057ff] [&::-moz-range-thumb]:shadow-[0_5px_18px_rgba(0,87,255,0.38)]`}
        />

        <input
          type="range"
          min={0}
          max={safeMax}
          step={step}
          value={sliderTo}
          onChange={(event) =>
            onChangeTo(Math.max(Number(event.target.value), sliderFrom))
          }
          aria-label="Максимальная цена"
          className={`pointer-events-none absolute inset-0 z-30 h-9 w-full appearance-none bg-transparent outline-none
            [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:bg-transparent
            [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:mt-[-7px]
            [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6
            [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[5px]
            [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[#00aaff]
            [&::-webkit-slider-thumb]:shadow-[0_5px_18px_rgba(0,170,255,0.38)]
            [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-200
            active:[&::-webkit-slider-thumb]:cursor-grabbing active:[&::-webkit-slider-thumb]:scale-125
            [&::-moz-range-track]:h-2 [&::-moz-range-track]:bg-transparent
            [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4
            [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:border-[5px] [&::-moz-range-thumb]:border-white
            [&::-moz-range-thumb]:bg-[#00aaff] [&::-moz-range-thumb]:shadow-[0_5px_18px_rgba(0,170,255,0.38)]`}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-blue-100 transition focus-within:ring-2 focus-within:ring-[#0057ff]">
          <span className="block text-[11px] font-black uppercase tracking-wide text-gray-400">
            Цена от
          </span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={step}
              value={from || ""}
              onChange={(event) => {
                const value = Math.max(0, Number(event.target.value) || 0);
                onChangeFrom(Math.min(value, sliderTo));
              }}
              placeholder="0"
              className="min-w-0 flex-1 border-0 bg-transparent text-lg font-black text-gray-950 outline-none"
            />
            <span className="font-black text-gray-400">₽</span>
          </div>
        </label>

        <label className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-blue-100 transition focus-within:ring-2 focus-within:ring-[#0057ff]">
          <span className="block text-[11px] font-black uppercase tracking-wide text-gray-400">
            Цена до
          </span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={step}
              value={to ?? ""}
              onChange={(event) => {
                if (!event.target.value) {
                  onChangeTo(null);
                  return;
                }
                onChangeTo(
                  Math.min(
                    safeMax,
                    Math.max(sliderFrom, Number(event.target.value) || sliderFrom)
                  )
                );
              }}
              placeholder={`до ${formatPrice(safeMax)}`}
              className="min-w-0 flex-1 border-0 bg-transparent text-lg font-black text-gray-950 outline-none"
            />
            <span className="font-black text-gray-400">₽</span>
          </div>
        </label>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [listings, setListings] = useState<SearchableListing[]>([]);
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [feedMode, setFeedMode] = useState<FeedMode>("contractors");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [city, setCity] = useState("");
  const [priceFrom, setPriceFrom] = useState(0);
  const [priceTo, setPriceTo] = useState<number | null>(null);
  const [accountType, setAccountType] = useState<AccountTypeFilter>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentFilter>("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [withPhotosOnly, setWithPhotosOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const listingQuery = query(
      collection(db, "listings"),
      orderBy("createdAt", "desc")
    );

    const unsubscribeListings = onSnapshot(listingQuery, (snapshot) => {
      const data = snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      })) as SearchableListing[];

      setListings(data);
    });

    const unsubscribeRequests = onSnapshot(
      collection(db, "customerRequests"),
      (snapshot) => {
        const data = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        })) as CustomerRequest[];

        data.sort(
          (a, b) =>
            firestoreDateToMillis(b.createdAt) - firestoreDateToMillis(a.createdAt)
        );

        setRequests(data);
      }
    );

    return () => {
      unsubscribeListings();
      unsubscribeRequests();
    };
  }, []);

  const selectedCategory = categories.find((item) => item.name === category);

  const availableCities = useMemo(() => {
    const source = feedMode === "contractors" ? listings : requests;
    const dynamicCities = source
      .map((item) => String(item.city || "").trim())
      .filter(Boolean);

    return Array.from(new Set([...POPULAR_CITIES, ...dynamicCities])).sort((a, b) =>
      a.localeCompare(b, "ru")
    );
  }, [feedMode, listings, requests]);

  const priceCeiling = useMemo(() => {
    const values =
      feedMode === "contractors"
        ? listings.flatMap((listing) => {
            const range = listingPriceRange(listing);
            return [range.from, range.to].filter(
              (value): value is number => value !== null && value > 0
            );
          })
        : requests.flatMap((request) => {
            const range = requestPriceRange(request);
            return [range.from, range.to].filter(
              (value): value is number => value !== null && value > 0
            );
          });

    const rawMax = values.length ? Math.max(...values) : 100_000;
    const rounded = Math.ceil(rawMax / 10_000) * 10_000;
    return Math.max(100_000, rounded);
  }, [feedMode, listings, requests]);

  const priceStep = priceCeiling >= 1_000_000 ? 10_000 : 1_000;

  useEffect(() => {
    if (priceTo !== null && priceTo > priceCeiling) {
      setPriceTo(priceCeiling);
    }
  }, [priceCeiling, priceTo]);

  const filteredListings = useMemo(() => {
    return listings.filter((listing) => {
      const matchesSearch = matchesListingSearch(
        listing as Record<string, any>,
        search,
        category,
        subcategory
      );
      const matchesCategory = category ? listing.category === category : true;
      const matchesSubcategory = subcategory
        ? listing.subcategory === subcategory
        : true;
      const matchesCity = cityMatches(listing.city, city);
      const range = listingPriceRange(listing);
      const matchesPrice = overlapsPriceRange(
        range.from,
        range.to,
        priceFrom,
        priceTo
      );
      const matchesAccount = accountType
        ? listing.accountType === accountType
        : true;
      const matchesPayment = paymentMethod
        ? Array.isArray(listing.paymentMethods) &&
          listing.paymentMethods.includes(paymentMethod)
        : true;
      const matchesVerified = verifiedOnly ? isListingVerified(listing) : true;
      const matchesPhotos = withPhotosOnly ? hasImages(listing) : true;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesSubcategory &&
        matchesCity &&
        matchesPrice &&
        matchesAccount &&
        matchesPayment &&
        matchesVerified &&
        matchesPhotos
      );
    });
  }, [
    listings,
    search,
    category,
    subcategory,
    city,
    priceFrom,
    priceTo,
    accountType,
    paymentMethod,
    verifiedOnly,
    withPhotosOnly,
  ]);

  const filteredRequests = useMemo(
    () =>
      requests.filter((request) => {
        const baseMatches = requestMatches(
          request,
          search,
          category,
          subcategory
        );
        const matchesCity = cityMatches(request.city, city);
        const range = requestPriceRange(request);
        const matchesPrice = overlapsPriceRange(
          range.from,
          range.to,
          priceFrom,
          priceTo
        );
        const matchesUrgency = urgentOnly
          ? request.urgency === "urgent"
          : true;
        const matchesPhotos = withPhotosOnly ? hasImages(request) : true;

        return (
          baseMatches &&
          matchesCity &&
          matchesPrice &&
          matchesUrgency &&
          matchesPhotos
        );
      }),
    [
      requests,
      search,
      category,
      subcategory,
      city,
      priceFrom,
      priceTo,
      urgentOnly,
      withPhotosOnly,
    ]
  );

  const shownCount =
    feedMode === "contractors" ? filteredListings.length : filteredRequests.length;

  const priceFilterActive = priceFrom > 0 || priceTo !== null;
  const activeFilterCount =
    Number(Boolean(category)) +
    Number(Boolean(subcategory)) +
    Number(Boolean(city)) +
    Number(priceFilterActive) +
    Number(withPhotosOnly) +
    (feedMode === "contractors"
      ? Number(Boolean(accountType)) +
        Number(Boolean(paymentMethod)) +
        Number(verifiedOnly)
      : Number(urgentOnly));

  function scrollToFeed() {
    document
      .getElementById("recommended-listings")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetFilters() {
    setSearch("");
    setCategory("");
    setSubcategory("");
    setCity("");
    setPriceFrom(0);
    setPriceTo(null);
    setAccountType("");
    setPaymentMethod("");
    setVerifiedOnly(false);
    setUrgentOnly(false);
    setWithPhotosOnly(false);
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb]">
      <section className="relative z-40 border-b border-gray-200 bg-white px-5 py-5">
        <div className="mx-auto max-w-7xl">
          <div className="relative flex flex-col gap-3 lg:flex-row lg:items-stretch">
            <button
              type="button"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((current) => !current)}
              className={`group inline-flex min-h-14 shrink-0 items-center justify-center gap-3 rounded-2xl px-5 text-sm font-black transition duration-300 active:scale-[0.97] lg:justify-start ${
                filtersOpen || activeFilterCount
                  ? "bg-[#0057ff] text-white shadow-lg shadow-blue-600/20 hover:-translate-y-0.5 hover:bg-[#004de6]"
                  : "bg-[#eef5ff] text-[#0057ff] ring-1 ring-blue-100 hover:-translate-y-0.5 hover:bg-blue-100"
              }`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-xl transition duration-300 group-hover:rotate-[-5deg] ${
                  filtersOpen || activeFilterCount
                    ? "bg-white/15"
                    : "bg-white shadow-sm"
                }`}
              >
                <SlidersHorizontal size={19} strokeWidth={2.7} />
              </span>
              <span>Фильтры</span>
              {activeFilterCount ? (
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-xs font-black text-[#0057ff]">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>

            <div className="flex min-w-0 flex-1 overflow-hidden rounded-2xl border-2 border-[#00aaff] bg-white shadow-sm transition focus-within:border-[#0057ff] focus-within:shadow-[0_0_0_4px_rgba(0,87,255,0.10)]">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-gray-400"
                  size={21}
                />

                <input
                  className="h-full min-h-14 w-full border-0 bg-transparent py-3 pl-14 pr-4 text-base font-bold text-gray-950 outline-none placeholder:font-medium placeholder:text-gray-400"
                  placeholder={
                    feedMode === "contractors"
                      ? "Поиск по анкетам исполнителей"
                      : "Поиск по заявкам заказчиков"
                  }
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") scrollToFeed();
                  }}
                />
              </div>

              <button
                type="button"
                onClick={scrollToFeed}
                className="min-h-14 shrink-0 bg-[#00aaff] px-7 text-sm font-black text-white transition duration-200 hover:bg-[#0097e6] active:scale-[0.98] md:px-10"
              >
                Найти
              </button>
            </div>

            <label className="group relative flex min-h-14 min-w-[220px] shrink-0 items-center overflow-hidden rounded-2xl border-2 border-blue-100 bg-white shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-[#00aaff] hover:shadow-lg focus-within:border-[#0057ff] focus-within:shadow-[0_0_0_4px_rgba(0,87,255,0.10)]">
              <MapPin
                size={20}
                strokeWidth={2.7}
                className="pointer-events-none absolute left-4 text-[#0057ff] transition duration-300 group-hover:scale-110"
              />
              <select
                value={city}
                onChange={(event) => setCity(event.target.value)}
                aria-label="Выбрать город"
                className="h-full min-h-14 w-full cursor-pointer appearance-none border-0 bg-transparent py-3 pl-12 pr-10 text-sm font-black text-gray-800 outline-none"
              >
                <option value="">Вся Россия</option>
                {availableCities.map((cityName) => (
                  <option key={cityName} value={cityName}>
                    {cityName}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-4 text-xs font-black text-[#0057ff]">
                ▼
              </span>
            </label>

            {filtersOpen ? (
              <div className="absolute left-0 right-0 top-[calc(100%+12px)] z-50 max-h-[78vh] overflow-y-auto rounded-[30px] border border-blue-100 bg-white p-5 shadow-[0_28px_85px_rgba(15,23,42,0.22)] sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0057ff]">
                      Расширенный подбор
                    </p>
                    <h2 className="mt-1 text-2xl font-black text-gray-950">
                      Найдите подходящую публикацию
                    </h2>
                    <p className="mt-1 text-sm font-bold text-gray-500">
                      Все параметры применяются сразу к ленте ниже
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setFiltersOpen(false)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-xl font-black text-gray-500 transition duration-300 hover:rotate-90 hover:bg-gray-200 active:scale-90"
                    aria-label="Закрыть фильтры"
                  >
                    ×
                  </button>
                </div>

                <datalist id="stroika-city-options">
                  {availableCities.map((cityName) => (
                    <option key={cityName} value={cityName} />
                  ))}
                </datalist>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <label>
                    <span className="mb-2 block text-xs font-black uppercase tracking-wide text-gray-500">
                      Категория
                    </span>
                    <select
                      className="input bg-white font-bold text-gray-950"
                      value={category}
                      onChange={(event) => {
                        setCategory(event.target.value);
                        setSubcategory("");
                      }}
                    >
                      <option value="">Все категории</option>
                      {categories.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span className="mb-2 block text-xs font-black uppercase tracking-wide text-gray-500">
                      Подкатегория
                    </span>
                    <select
                      className="input bg-white font-bold text-gray-950 disabled:bg-gray-50 disabled:text-gray-400"
                      value={subcategory}
                      onChange={(event) => setSubcategory(event.target.value)}
                      disabled={!category}
                    >
                      <option value="">Все подкатегории</option>
                      {selectedCategory?.subcategories.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span className="mb-2 block text-xs font-black uppercase tracking-wide text-gray-500">
                      Город
                    </span>
                    <div className="relative">
                      <MapPin
                        size={18}
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#0057ff]"
                      />
                      <input
                        list="stroika-city-options"
                        value={city}
                        onChange={(event) => setCity(event.target.value)}
                        placeholder="Выберите или напишите город"
                        className="input bg-white pl-11 font-bold text-gray-950"
                      />
                    </div>
                  </label>
                </div>

                <div className="mt-5">
                  <PriceRangeSlider
                    max={priceCeiling}
                    step={priceStep}
                    from={priceFrom}
                    to={priceTo}
                    onChangeFrom={setPriceFrom}
                    onChangeTo={setPriceTo}
                  />
                </div>

                <div className="mt-5 rounded-[24px] border border-gray-200 bg-gray-50/80 p-4 sm:p-5">
                  <p className="text-xs font-black uppercase tracking-[0.13em] text-gray-500">
                    Дополнительные параметры
                  </p>

                  {feedMode === "contractors" ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <label className="group flex cursor-pointer items-center gap-3 rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-gray-200 transition hover:-translate-y-0.5 hover:ring-blue-200">
                        <Building2 size={20} className="text-[#0057ff]" />
                        <select
                          value={accountType}
                          onChange={(event) =>
                            setAccountType(event.target.value as AccountTypeFilter)
                          }
                          className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent text-sm font-black text-gray-800 outline-none"
                        >
                          <option value="">Любой тип исполнителя</option>
                          <option value="individual">Физлицо</option>
                          <option value="ip">ИП</option>
                          <option value="ooo">ООО</option>
                        </select>
                      </label>

                      <label className="group flex cursor-pointer items-center gap-3 rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-gray-200 transition hover:-translate-y-0.5 hover:ring-blue-200">
                        {paymentMethod === "transfer" ? (
                          <CreditCard size={20} className="text-[#0057ff]" />
                        ) : (
                          <Banknote size={20} className="text-[#0057ff]" />
                        )}
                        <select
                          value={paymentMethod}
                          onChange={(event) =>
                            setPaymentMethod(event.target.value as PaymentFilter)
                          }
                          className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent text-sm font-black text-gray-800 outline-none"
                        >
                          <option value="">Любой способ оплаты</option>
                          <option value="cash">Наличными</option>
                          <option value="transfer">Переводом</option>
                        </select>
                      </label>

                      <button
                        type="button"
                        onClick={() => setVerifiedOnly((current) => !current)}
                        className={`group flex items-center gap-3 rounded-2xl p-3.5 text-left shadow-sm ring-1 transition duration-300 hover:-translate-y-0.5 active:scale-[0.98] ${
                          verifiedOnly
                            ? "bg-[#0057ff] text-white ring-[#0057ff]"
                            : "bg-white text-gray-800 ring-gray-200 hover:ring-blue-200"
                        }`}
                      >
                        <span
                          className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
                            verifiedOnly ? "bg-white/15" : "bg-blue-50 text-[#0057ff]"
                          }`}
                        >
                          <BadgeCheck size={20} />
                        </span>
                        <span>
                          <span className="block text-sm font-black">
                            Только проверенные
                          </span>
                          <span
                            className={`mt-0.5 block text-xs font-bold ${
                              verifiedOnly ? "text-blue-100" : "text-gray-400"
                            }`}
                          >
                            Исполнители с подтверждением
                          </span>
                        </span>
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setUrgentOnly((current) => !current)}
                        className={`group flex items-center gap-3 rounded-2xl p-3.5 text-left shadow-sm ring-1 transition duration-300 hover:-translate-y-0.5 active:scale-[0.98] ${
                          urgentOnly
                            ? "bg-orange-500 text-white ring-orange-500"
                            : "bg-white text-gray-800 ring-gray-200 hover:ring-orange-200"
                        }`}
                      >
                        <span
                          className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                            urgentOnly ? "bg-white/15" : "bg-orange-50 text-orange-500"
                          }`}
                        >
                          <Zap size={20} />
                        </span>
                        <span>
                          <span className="block text-sm font-black">
                            Только срочные заявки
                          </span>
                          <span
                            className={`mt-0.5 block text-xs font-bold ${
                              urgentOnly ? "text-orange-100" : "text-gray-400"
                            }`}
                          >
                            Заказы, которым нужен быстрый отклик
                          </span>
                        </span>
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setWithPhotosOnly((current) => !current)}
                    className={`mt-3 flex w-full items-center gap-3 rounded-2xl p-3.5 text-left shadow-sm ring-1 transition duration-300 hover:-translate-y-0.5 active:scale-[0.99] ${
                      withPhotosOnly
                        ? "bg-[#0f172a] text-white ring-[#0f172a]"
                        : "bg-white text-gray-800 ring-gray-200 hover:ring-blue-200"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                        withPhotosOnly ? "bg-white/10" : "bg-blue-50 text-[#0057ff]"
                      }`}
                    >
                      <ImageIcon size={20} />
                    </span>
                    <span>
                      <span className="block text-sm font-black">Только с фотографиями</span>
                      <span
                        className={`mt-0.5 block text-xs font-bold ${
                          withPhotosOnly ? "text-gray-300" : "text-gray-400"
                        }`}
                      >
                        Скрыть публикации без примеров работ или объекта
                      </span>
                    </span>
                  </button>
                </div>

                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold text-gray-500">
                    <UserRound size={18} className="text-[#0057ff]" />
                    Найдено: <strong className="text-gray-950">{shownCount}</strong>
                  </div>

                  <div className="flex flex-col-reverse gap-3 sm:flex-row">
                    <button
                      type="button"
                      className="rounded-2xl bg-gray-100 px-5 py-3 font-black text-gray-700 transition hover:-translate-y-0.5 hover:bg-gray-200 active:scale-[0.98]"
                      onClick={resetFilters}
                    >
                      Сбросить всё
                    </button>

                    <button
                      type="button"
                      className="rounded-2xl bg-[#0057ff] px-7 py-3 font-black text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-[#004de6] hover:shadow-xl active:scale-[0.98]"
                      onClick={() => {
                        setFiltersOpen(false);
                        scrollToFeed();
                      }}
                    >
                      Показать {shownCount} {shownCount === 1 ? "результат" : "результатов"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section
        id="premium-catalog"
        className="mx-auto max-w-7xl scroll-mt-28 px-5 pt-5"
      >
        <PremiumCategoryGrid
          categories={categories}
          selectedCategory={category}
          selectedSubcategory={subcategory}
          onSelectCategory={(value) => {
            setCategory(value);
            setSubcategory("");
          }}
          onApplySelection={({
            category: nextCategory,
            subcategory: nextSubcategory,
            search: nextSearch,
          }) => {
            setCategory(nextCategory || "");
            setSubcategory(nextSubcategory || "");
            setSearch(nextSearch || "");
          }}
        />
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-8 pt-5">
        <div
          id="recommended-listings"
          className="mt-8 scroll-mt-28 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"
        >
          <div>
            <h2 className="text-4xl font-black text-gray-950">Для вас</h2>
            <p className="mt-2 font-medium text-gray-500">
              Найдено публикаций: {shownCount}
              {city ? ` · ${city}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-gray-200">
              <button
                type="button"
                onClick={() => setFeedMode("contractors")}
                className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition duration-300 ${
                  feedMode === "contractors"
                    ? "bg-[#0057ff] text-white shadow-lg shadow-blue-600/20"
                    : "text-gray-500 hover:bg-blue-50 hover:text-[#0057ff]"
                }`}
              >
                <HardHat size={18} />
                Исполнители
              </button>

              <button
                type="button"
                onClick={() => setFeedMode("customers")}
                className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition duration-300 ${
                  feedMode === "customers"
                    ? "bg-[#0057ff] text-white shadow-lg shadow-blue-600/20"
                    : "text-gray-500 hover:bg-blue-50 hover:text-[#0057ff]"
                }`}
              >
                <ClipboardList size={18} />
                Заказчики
              </button>
            </div>

            <NearbyWorkerButton />
          </div>
        </div>

        {shownCount === 0 ? (
          <div className="mt-8 rounded-[30px] border border-dashed border-blue-200 bg-white p-12 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-50 text-[#0057ff]">
              <Search size={30} />
            </div>

            <h3 className="mt-5 text-3xl font-black text-gray-950">
              Ничего не найдено
            </h3>

            <p className="mx-auto mt-3 max-w-xl text-gray-500">
              Попробуй другой запрос, город, цену или сбрось фильтры.
            </p>
          </div>
        ) : feedMode === "contractors" ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {filteredListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredRequests.map((request) => (
              <CustomerRequestCard key={request.id} request={request} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
