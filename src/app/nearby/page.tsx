"use client";

import { db } from "@/lib/firebase";
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock3,
  Crosshair,
  Filter,
  Layers3,
  Loader2,
  LocateFixed,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Truck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { collection, getDocs, limit, query } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    ymaps?: any;
    __stroikaYandexMapsPromise?: Promise<any>;
  }
}

type Coordinates = {
  lat: number;
  lng: number;
};

type ListingLike = {
  id: string;
  title?: string;
  name?: string;
  description?: string;
  category?: string;
  subcategory?: string;
  city?: string;
  district?: string;
  address?: string;
  price?: string | number;
  priceFrom?: string | number;
  budget?: string | number;
  phone?: string;
  authorName?: string;
  userName?: string;
  companyName?: string;
  displayName?: string;
  imageUrl?: string;
  photoUrl?: string;
  avatarUrl?: string;
  photos?: string[];
  images?: string[];
  imageUrls?: string[];
  media?: Array<{ url?: string; type?: string }>;
  userId?: string;
  authorId?: string;
  ownerId?: string;
  creatorId?: string;
  uid?: string;
  latitude?: number | string;
  longitude?: number | string;
  lat?: number | string;
  lng?: number | string;
  coordinates?: {
    latitude?: number | string;
    longitude?: number | string;
    lat?: number | string;
    lng?: number | string;
  };
  location?: {
    latitude?: number | string;
    longitude?: number | string;
    lat?: number | string;
    lng?: number | string;
    address?: string;
  };
  createdAt?: any;
  isUrgent?: boolean;
  verified?: boolean;
  accountType?: string;
};

const defaultCenter: Coordinates = {
  // Нижний Новгород — базовый центр, чтобы карта не улетала в Москву.
  lat: 56.326887,
  lng: 44.005986,
};

const baseCategories = [
  "Все категории",
  "Ремонт квартир",
  "Сантехника",
  "Электрика",
  "Строительство",
  "Спецтехника",
  "Материалы",
  "Отделочные работы",
  "Крыша и фасад",
  "Окна и двери",
  "Инженерные системы",
  "Участок и благоустройство",
];

function normalize(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replaceAll("ё", "е");
}

function safeNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return null;

  const numberValue =
    typeof value === "string" ? Number(value.replace(",", ".").trim()) : Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeCoords(latValue: unknown, lngValue: unknown): Coordinates | null {
  let lat = safeNumber(latValue);
  let lng = safeNumber(lngValue);

  if (lat === null || lng === null) return null;

  // Иногда координаты сохраняются в формате Яндекса [lng, lat].
  // Если видим, что широта невозможная, а долгота похожа на широту — меняем местами.
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
    const oldLat = lat;
    lat = lng;
    lng = oldLat;
  }

  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  return { lat, lng };
}

function getItemCoords(item: ListingLike): Coordinates | null {
  return (
    normalizeCoords(item.location?.lat, item.location?.lng) ||
    normalizeCoords(item.location?.latitude, item.location?.longitude) ||
    normalizeCoords(item.coordinates?.lat, item.coordinates?.lng) ||
    normalizeCoords(item.coordinates?.latitude, item.coordinates?.longitude) ||
    normalizeCoords(item.lat, item.lng) ||
    normalizeCoords(item.latitude, item.longitude)
  );
}

function getAddressForGeocode(item: ListingLike) {
  const locationAddress = String(item.location?.address || "").trim();
  const city = String(item.city || "").trim();
  const district = String(item.district || "").trim();
  const address = String(item.address || "").trim();

  // Если в location.address уже полный адрес от Яндекса — используем его первым.
  if (locationAddress.length >= 3) return locationAddress;

  return [city, district, address].filter(Boolean).join(", ").trim();
}

function getResolvedItemCoords(
  item: ListingLike,
  resolvedCoords: Record<string, Coordinates>
): Coordinates | null {
  return getItemCoords(item) || resolvedCoords[item.id] || null;
}

function getListingImage(item: ListingLike) {
  if (item.imageUrl) return item.imageUrl;
  if (item.photoUrl) return item.photoUrl;
  if (item.avatarUrl) return item.avatarUrl;
  if (Array.isArray(item.photos) && item.photos[0]) return item.photos[0];
  if (Array.isArray(item.images) && item.images[0]) return item.images[0];
  if (Array.isArray(item.imageUrls) && item.imageUrls[0]) return item.imageUrls[0];

  const mediaImage = item.media?.find((media) => {
    if (!media?.url) return false;
    if (media.type === "image") return true;
    return /\.(jpg|jpeg|png|webp|gif)$/i.test(media.url);
  });

  return mediaImage?.url || "";
}

function getPrice(item: ListingLike) {
  const value = item.price || item.priceFrom || item.budget;

  if (!value) return "Цена договорная";

  if (typeof value === "number") {
    return `${value.toLocaleString("ru-RU")} ₽`;
  }

  return String(value);
}

function getAuthor(item: ListingLike) {
  return (
    item.companyName ||
    item.authorName ||
    item.userName ||
    item.displayName ||
    (item.accountType === "ooo"
      ? "Компания"
      : item.accountType === "ip"
      ? "ИП / мастер"
      : "Исполнитель")
  );
}

function getProfileId(item: ListingLike) {
  return item.userId || item.authorId || item.ownerId || item.creatorId || item.uid || "";
}

function getProfileLink(item: ListingLike) {
  const profileId = getProfileId(item);
  return profileId ? `/player/${profileId}` : `/listing/${item.id}`;
}

function getLocation(item: ListingLike) {
  const locationAddress = String(item.location?.address || "").trim();
  if (locationAddress) return locationAddress;

  return [item.city, item.district, item.address].filter(Boolean).join(", ");
}

function getDistanceText(
  item: ListingLike,
  userCoords: Coordinates | null,
  resolvedCoords: Record<string, Coordinates> = {}
) {
  const coords = getResolvedItemCoords(item, resolvedCoords);

  if (!coords || !userCoords) {
    return "рядом по выбранному городу";
  }

  const earthRadiusKm = 6371;
  const dLat = ((coords.lat - userCoords.lat) * Math.PI) / 180;
  const dLng = ((coords.lng - userCoords.lng) * Math.PI) / 180;
  const userLat = (userCoords.lat * Math.PI) / 180;
  const itemLat = (coords.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) *
      Math.sin(dLng / 2) *
      Math.cos(userLat) *
      Math.cos(itemLat);

  const distance = earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  if (distance < 1) return `${Math.round(distance * 1000)} м от вас`;

  return `${distance.toFixed(1)} км от вас`;
}

function loadYandexMaps() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Карта доступна только в браузере."));
  }

  if (window.ymaps) {
    return new Promise<any>((resolve) => {
      window.ymaps.ready(() => resolve(window.ymaps));
    });
  }

  if (window.__stroikaYandexMapsPromise) {
    return window.__stroikaYandexMapsPromise;
  }

  const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY || "";
  const scriptUrl = apiKey
    ? `https://api-maps.yandex.ru/2.1/?apikey=${apiKey}&lang=ru_RU`
    : "https://api-maps.yandex.ru/2.1/?lang=ru_RU";

  window.__stroikaYandexMapsPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-stroika-yandex-map="true"]'
    );

    if (existingScript) {
      existingScript.addEventListener("load", () => {
        window.ymaps?.ready(() => resolve(window.ymaps));
      });
      existingScript.addEventListener("error", () => {
        reject(new Error("Не получилось загрузить Яндекс.Карты."));
      });
      return;
    }

    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.defer = true;
    script.dataset.stroikaYandexMap = "true";

    script.onload = () => {
      if (!window.ymaps) {
        reject(new Error("Яндекс.Карты загрузились, но ymaps не найден."));
        return;
      }

      window.ymaps.ready(() => resolve(window.ymaps));
    };

    script.onerror = () => {
      reject(new Error("Не получилось загрузить Яндекс.Карты."));
    };

    document.head.appendChild(script);
  });

  return window.__stroikaYandexMapsPromise;
}

export default function NearbyPage() {
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const userPlacemarkRef = useRef<any>(null);

  const [items, setItems] = useState<ListingLike[]>([]);
  const [activeId, setActiveId] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("Все категории");
  const [searchText, setSearchText] = useState("");
  const [onlyUrgent, setOnlyUrgent] = useState(false);
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [userCoords, setUserCoords] = useState<Coordinates | null>(null);
  const [resolvedCoords, setResolvedCoords] = useState<Record<string, Coordinates>>({});
  const [mapCenter, setMapCenter] = useState<Coordinates>(defaultCenter);
  const [mapStatus, setMapStatus] = useState("Загружаем Яндекс.Карты...");
  const [geoStatus, setGeoStatus] = useState("");
  const [isMapReady, setIsMapReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadListings() {
      setIsLoading(true);
      setError("");

      try {
        const snapshot = await getDocs(query(collection(db, "listings"), limit(250)));

        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<ListingLike, "id">),
        }));

        setItems(data);
        setActiveId(data[0]?.id || "");

        const firstCoords = data.map((item) => getItemCoords(item)).find(Boolean);

        if (firstCoords) {
          setMapCenter(firstCoords);
        } else {
          setMapCenter(defaultCenter);
        }
      } catch (loadError) {
        console.error(loadError);
        setError("Не получилось загрузить объявления. Проверь Firebase и коллекцию listings.");
      } finally {
        setIsLoading(false);
      }
    }

    loadListings();
  }, []);

  useEffect(() => {
    let destroyed = false;

    async function initMap() {
      if (!mapNodeRef.current || mapRef.current) return;

      try {
        const ymaps = await loadYandexMaps();

        if (destroyed || !mapNodeRef.current) return;

        const map = new ymaps.Map(mapNodeRef.current, {
          center: [mapCenter.lat, mapCenter.lng],
          zoom: 11,
          controls: ["zoomControl", "fullscreenControl", "geolocationControl", "typeSelector"],
        });

        map.behaviors.enable(["drag", "scrollZoom", "multiTouch"]);

        mapRef.current = map;
        setIsMapReady(true);
        setMapStatus("");
      } catch (mapError) {
        console.error(mapError);
        setMapStatus(
          "Не получилось загрузить Яндекс.Карты. Добавь NEXT_PUBLIC_YANDEX_MAPS_API_KEY в .env.local или проверь интернет."
        );
      }
    }

    initMap();

    return () => {
      destroyed = true;
    };
  }, [mapCenter.lat, mapCenter.lng]);

  useEffect(() => {
    let cancelled = false;

    async function resolveMissingListingCoords() {
      if (!isMapReady || items.length === 0) return;

      const missingItems = items.filter((item) => {
        if (getItemCoords(item) || resolvedCoords[item.id]) return false;
        return getAddressForGeocode(item).length >= 3;
      });

      if (missingItems.length === 0) {
        setGeoStatus("");
        return;
      }

      try {
        const ymaps = await loadYandexMaps();

        if (cancelled) return;

        setGeoStatus("Определяем координаты объявлений по адресам...");

        const updates: Record<string, Coordinates> = {};

        for (const item of missingItems.slice(0, 80)) {
          const address = getAddressForGeocode(item);

          try {
            // 1) Сначала пробуем геокодер из JS API Яндекса.
            const result = await ymaps.geocode(address, { results: 1 });
            const geoObject = result.geoObjects.get(0);
            const coordinates = geoObject?.geometry?.getCoordinates?.();

            if (Array.isArray(coordinates) && coordinates.length >= 2) {
              const coords = normalizeCoords(coordinates[0], coordinates[1]);

              if (coords) {
                updates[item.id] = coords;
                continue;
              }
            }

            // 2) Если JS API не дал координаты — пробуем наш /api/geocode.
            const apiResponse = await fetch(
              `/api/geocode?address=${encodeURIComponent(address)}`
            );
            const apiData = await apiResponse.json();

            if (apiResponse.ok) {
              const coords = normalizeCoords(apiData?.lat, apiData?.lng);
              if (coords) updates[item.id] = coords;
            }
          } catch (itemError) {
            console.warn("Не удалось определить координаты:", address, itemError);
          }
        }

        if (cancelled) return;

        if (Object.keys(updates).length > 0) {
          setResolvedCoords((prev) => ({ ...prev, ...updates }));

          const firstCoords = Object.values(updates)[0];

          if (firstCoords && !userCoords) {
            setMapCenter(firstCoords);
          }

          setGeoStatus("");
        } else {
          setGeoStatus("Не получилось определить координаты по адресам. Уточни город и адрес в объявлении.");
        }
      } catch (geoError) {
        console.error(geoError);
        if (!cancelled) {
          setGeoStatus("Не получилось запустить геокодер Яндекс.Карт.");
        }
      }
    }

    resolveMissingListingCoords();

    return () => {
      cancelled = true;
    };
  }, [items, isMapReady, resolvedCoords, userCoords]);

  const cities = useMemo(() => {
    const set = new Set<string>();

    items.forEach((item) => {
      if (item.city) set.add(String(item.city));
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [items]);

  const categories = useMemo(() => {
    const set = new Set<string>(baseCategories);

    items.forEach((item) => {
      if (item.category) set.add(String(item.category));
      if (item.subcategory) set.add(String(item.subcategory));
    });

    return Array.from(set);
  }, [items]);

  const filteredItems = useMemo(() => {
    const cityValue = normalize(city);
    const categoryValue = normalize(category === "Все категории" ? "" : category);
    const searchValue = normalize(searchText);

    return items.filter((item) => {
      const location = normalize(getLocation(item));
      const itemCategory = normalize(`${item.category || ""} ${item.subcategory || ""}`);
      const fullText = normalize(
        [
          item.title,
          item.name,
          item.description,
          item.category,
          item.subcategory,
          item.city,
          item.district,
          item.address,
          item.authorName,
          item.userName,
          item.companyName,
          item.displayName,
        ].join(" ")
      );

      const cityOk = !cityValue || location.includes(cityValue);
      const categoryOk = !categoryValue || itemCategory.includes(categoryValue);
      const searchOk = !searchValue || fullText.includes(searchValue);
      const urgentOk = !onlyUrgent || Boolean(item.isUrgent);
      const verifiedOk = !onlyVerified || Boolean(item.verified);

      return cityOk && categoryOk && searchOk && urgentOk && verifiedOk;
    });
  }, [items, city, category, searchText, onlyUrgent, onlyVerified]);

  const activeItem =
    filteredItems.find((item) => item.id === activeId) || filteredItems[0] || null;

  useEffect(() => {
    if (!activeItem) {
      setActiveId("");
      return;
    }

    if (!filteredItems.some((item) => item.id === activeId)) {
      setActiveId(activeItem.id);
    }
  }, [filteredItems, activeId, activeItem]);

  useEffect(() => {
    async function redrawMap() {
      if (!isMapReady || !mapRef.current) return;

      const ymaps = await loadYandexMaps();
      const map = mapRef.current;

      if (clustererRef.current) {
        map.geoObjects.remove(clustererRef.current);
      }

      if (userPlacemarkRef.current) {
        map.geoObjects.remove(userPlacemarkRef.current);
      }

      const center = userCoords || mapCenter;

      // Метку «Вы здесь» показываем только когда браузер реально дал геолокацию.
      // Иначе карта не будет врать, что пользователь находится в Москве или в дефолтной точке.
      if (userCoords) {
        userPlacemarkRef.current = new ymaps.Placemark(
          [userCoords.lat, userCoords.lng],
          {
            hintContent: "Вы здесь",
            balloonContentHeader: "Вы здесь",
            balloonContentBody: "Точка, которую вернул браузер по геолокации.",
          },
          {
            preset: "islands#blueCircleDotIconWithCaption",
            iconCaptionMaxWidth: 140,
          }
        );

        map.geoObjects.add(userPlacemarkRef.current);
      }

      const placemarks = filteredItems.flatMap((item) => {
        const coords = getResolvedItemCoords(item, resolvedCoords);

        if (!coords) return [];

        const image = getListingImage(item);
        const profileLink = getProfileLink(item);
        const listingLink = `/listing/${item.id}`;

        const placemark = new ymaps.Placemark(
          [coords.lat, coords.lng],
          {
            hintContent: item.title || item.name || getAuthor(item),
            balloonContentHeader: `
              <div style="font-weight:800;font-size:16px;line-height:1.2;">
                ${item.title || item.name || "Исполнитель"}
              </div>
            `,
            balloonContentBody: `
              <div style="max-width:260px;font-family:Arial,sans-serif;">
                ${
                  image
                    ? `<img src="${image}" style="width:100%;height:120px;object-fit:cover;border-radius:12px;margin:8px 0;" />`
                    : ""
                }
                <div style="font-size:13px;color:#475569;margin-top:6px;">
                  <b>${getAuthor(item)}</b>
                </div>
                <div style="font-size:13px;color:#475569;margin-top:6px;">
                  ${getLocation(item) || "Локация не указана"}
                </div>
                <div style="font-size:13px;color:#0057ff;font-weight:800;margin-top:8px;">
                  ${getPrice(item)}
                </div>
                <div style="display:flex;gap:8px;margin-top:12px;">
                  <a href="${profileLink}" style="display:inline-block;background:#0057ff;color:white;text-decoration:none;font-weight:800;border-radius:12px;padding:10px 12px;">Профиль</a>
                  <a href="${listingLink}" style="display:inline-block;background:#eff6ff;color:#0057ff;text-decoration:none;font-weight:800;border-radius:12px;padding:10px 12px;">Объявление</a>
                </div>
              </div>
            `,
          },
          {
            preset:
              item.category?.toLowerCase().includes("техник") ||
              item.subcategory?.toLowerCase().includes("кран") ||
              item.subcategory?.toLowerCase().includes("экскаватор")
                ? "islands#darkBlueTruckIcon"
                : item.verified
                ? "islands#bluePersonIcon"
                : "islands#blueHomeIcon",
          }
        );

        placemark.events.add("click", () => {
          setActiveId(item.id);
        });

        return [placemark];
      });

      const clusterer = new ymaps.Clusterer({
        preset: "islands#blueClusterIcons",
        groupByCoordinates: false,
        clusterDisableClickZoom: false,
        clusterOpenBalloonOnClick: true,
      });

      clusterer.add(placemarks);
      clustererRef.current = clusterer;
      map.geoObjects.add(clusterer);

      if (placemarks.length > 0) {
        const bounds = clusterer.getBounds();

        if (bounds) {
          map.setBounds(bounds, {
            checkZoomRange: true,
            zoomMargin: 50,
          });
        }
      } else {
        map.setCenter([center.lat, center.lng], 11);
      }
    }

    redrawMap();
  }, [filteredItems, userCoords, mapCenter, isMapReady, resolvedCoords]);

  useEffect(() => {
    async function focusActiveItem() {
      if (!isMapReady || !mapRef.current || !activeItem) return;

      const coords = getResolvedItemCoords(activeItem, resolvedCoords);

      if (!coords) return;

      mapRef.current.setCenter([coords.lat, coords.lng], Math.max(mapRef.current.getZoom(), 12), {
        duration: 250,
      });
    }

    focusActiveItem();
  }, [activeItem?.id, resolvedCoords]);

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoStatus("Геолокация недоступна. Выбери город вручную.");
      return;
    }

    setGeoStatus("Запрашиваем геолокацию...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setUserCoords(coords);
        setMapCenter(coords);
        setGeoStatus("Геолокация включена. Карта перестроена вокруг вас.");

        if (mapRef.current) {
          mapRef.current.setCenter([coords.lat, coords.lng], 12, {
            duration: 300,
          });
        }
      },
      () => {
        setGeoStatus("Не удалось получить геолокацию. Выбери город вручную.");
      },
      {
        enableHighAccuracy: true,
        timeout: 9000,
      }
    );
  }

  function resetFilters() {
    setCity("");
    setCategory("Все категории");
    setSearchText("");
    setOnlyUrgent(false);
    setOnlyVerified(false);
    setGeoStatus("");
  }

  function refreshMap() {
    if (mapRef.current) {
      mapRef.current.container.fitToViewport();
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 text-slate-950 md:px-6">
      <div className="mx-auto max-w-7xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-blue-700 shadow-sm ring-1 ring-blue-100 transition hover:bg-blue-50"
        >
          <ArrowLeft size={18} />
          На главную
        </Link>

        <section className="mt-7 overflow-hidden rounded-[42px] bg-[#0057ff] p-6 text-white shadow-2xl shadow-blue-500/20 md:p-10">
          <div className="relative grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-28 left-1/4 h-72 w-72 rounded-full bg-blue-200/20 blur-3xl" />

            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-3 text-sm font-black ring-1 ring-white/20">
                <Navigation size={18} />
                Карта исполнителей
              </div>

              <h1 className="mt-6 max-w-3xl text-4xl font-black leading-tight md:text-6xl">
                Исполнитель рядом
              </h1>

              <p className="mt-5 max-w-2xl text-base font-medium leading-8 text-blue-50 md:text-lg">
                Реальная карта: выбирай категорию, город или срочные заказы — и
                на карте останутся только подходящие профили.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={useMyLocation}
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-[#0057ff] shadow-lg shadow-blue-950/10 transition hover:bg-blue-50"
                >
                  <LocateFixed size={18} />
                  Я рядом
                </button>

                <button
                  type="button"
                  onClick={() => setOnlyUrgent((value) => !value)}
                  className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-black transition ${
                    onlyUrgent
                      ? "bg-white text-[#0057ff]"
                      : "bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20"
                  }`}
                >
                  <Clock3 size={18} />
                  Срочные
                </button>

                <button
                  type="button"
                  onClick={() => setOnlyVerified((value) => !value)}
                  className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-black transition ${
                    onlyVerified
                      ? "bg-white text-[#0057ff]"
                      : "bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20"
                  }`}
                >
                  <BadgeCheck size={18} />
                  Проверенные
                </button>
              </div>

              {geoStatus && (
                <div className="mt-5 flex max-w-2xl gap-3 rounded-3xl bg-white/10 px-5 py-4 text-sm font-bold leading-6 text-blue-50 ring-1 ring-white/10">
                  <AlertCircle className="mt-0.5 shrink-0" size={18} />
                  {geoStatus}
                </div>
              )}
            </div>

            <div className="relative z-10 rounded-[34px] bg-white p-5 text-slate-950 shadow-2xl md:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#0057ff] ring-1 ring-blue-100">
                  <Filter size={26} />
                </div>

                <div>
                  <h2 className="text-2xl font-black">Фильтр карты</h2>
                  <p className="text-sm font-medium text-slate-500">
                    Категория сразу меняет метки на карте.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Категория
                  </span>
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="w-full rounded-2xl border border-blue-100 bg-slate-50 px-4 py-4 text-sm font-bold outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  >
                    {categories.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Город
                  </span>
                  <input
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    list="nearby-cities"
                    placeholder="Например: Москва, Казань, Краснодар"
                    className="w-full rounded-2xl border border-blue-100 bg-slate-50 px-4 py-4 text-sm font-bold outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  />
                  <datalist id="nearby-cities">
                    {cities.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Что нужно найти
                  </span>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                      size={19}
                    />
                    <input
                      value={searchText}
                      onChange={(event) => setSearchText(event.target.value)}
                      placeholder="Например: плиточник, кран, бетон, сантехник"
                      className="w-full rounded-2xl border border-blue-100 bg-slate-50 py-4 pl-12 pr-4 text-sm font-bold outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    />
                  </div>
                </label>

                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-5 py-4 text-sm font-black text-slate-700 transition hover:bg-slate-200"
                >
                  <X size={18} />
                  Сбросить
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-7 grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-blue-100">
            <UsersRound className="text-blue-600" size={28} />
            <p className="mt-3 text-2xl font-black">{items.length}</p>
            <p className="text-sm font-bold text-slate-500">профилей и объявлений</p>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-blue-100">
            <MapPin className="text-blue-600" size={28} />
            <p className="mt-3 text-2xl font-black">{cities.length}</p>
            <p className="text-sm font-bold text-slate-500">городов в базе</p>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-blue-100">
            <Layers3 className="text-blue-600" size={28} />
            <p className="mt-3 truncate text-2xl font-black">{category}</p>
            <p className="text-sm font-bold text-slate-500">выбранная категория</p>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-blue-100">
            <Crosshair className="text-blue-600" size={28} />
            <p className="mt-3 text-2xl font-black">{filteredItems.length}</p>
            <p className="text-sm font-bold text-slate-500">показано на карте</p>
          </div>
        </section>

        {error && (
          <div className="mt-7 flex gap-3 rounded-3xl bg-red-50 p-5 text-sm font-bold text-red-700 ring-1 ring-red-100">
            <AlertCircle className="shrink-0" size={20} />
            {error}
          </div>
        )}

        <section className="mt-7 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="overflow-hidden rounded-[38px] bg-white p-4 shadow-sm ring-1 ring-blue-100 md:p-5">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-blue-700 ring-1 ring-blue-100">
                  <Sparkles size={16} />
                  Реальная карта
                </div>

                <h2 className="mt-3 text-3xl font-black">
                  {category === "Все категории" ? "Все исполнители рядом" : category}
                </h2>
              </div>

              <button
                type="button"
                onClick={refreshMap}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-200"
              >
                <RefreshCcw size={17} />
                Обновить карту
              </button>
            </div>

            <div className="relative h-[620px] overflow-hidden rounded-[32px] border border-blue-100 bg-slate-100">
              <div ref={mapNodeRef} className="absolute inset-0" />

              {(mapStatus || isLoading) && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 p-6 text-center backdrop-blur-sm">
                  <div className="max-w-lg rounded-[30px] bg-white p-7 shadow-xl ring-1 ring-blue-100">
                    {isLoading ? (
                      <Loader2 className="mx-auto animate-spin text-blue-600" size={42} />
                    ) : (
                      <AlertCircle className="mx-auto text-blue-600" size={42} />
                    )}
                    <h3 className="mt-4 text-2xl font-black">
                      {isLoading ? "Загружаем объявления..." : "Карта не загрузилась"}
                    </h3>
                    <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                      {isLoading ? "Сейчас подтянем профили из Firestore." : mapStatus}
                    </p>
                  </div>
                </div>
              )}

              {!isLoading && !mapStatus && filteredItems.length === 0 && (
                <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
                  <div className="max-w-md rounded-[30px] bg-white p-7 text-center shadow-xl ring-1 ring-blue-100">
                    <Search className="mx-auto text-blue-600" size={42} />
                    <h3 className="mt-4 text-2xl font-black">Никого не найдено</h3>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                      Попробуй выбрать другую категорию, город или убрать фильтры.
                    </p>
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="mt-5 rounded-2xl bg-[#0057ff] px-6 py-4 text-sm font-black text-white shadow-lg shadow-blue-500/20"
                    >
                      Сбросить фильтры
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-5">
            <div className="rounded-[34px] bg-white p-5 shadow-sm ring-1 ring-blue-100">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                  <ShieldCheck size={28} />
                </div>
                <div>
                  <h3 className="text-2xl font-black">Профиль на карте</h3>
                  <p className="text-sm font-medium text-slate-500">
                    Нажми на метку на карте
                  </p>
                </div>
              </div>

              {activeItem ? (
                <div className="mt-5">
                  {getListingImage(activeItem) ? (
                    <img
                      src={getListingImage(activeItem)}
                      alt={activeItem.title || "Профиль"}
                      className="h-56 w-full rounded-[26px] object-cover"
                    />
                  ) : (
                    <div className="flex h-56 w-full items-center justify-center rounded-[26px] bg-blue-50 text-blue-300">
                      <Building2 size={72} />
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-blue-50 px-4 py-2 text-xs font-black text-blue-700 ring-1 ring-blue-100">
                      {activeItem.category || "Категория"}
                    </span>

                    {activeItem.subcategory && (
                      <span className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700">
                        {activeItem.subcategory}
                      </span>
                    )}

                    {activeItem.isUrgent && (
                      <span className="rounded-full bg-[#0057ff] px-4 py-2 text-xs font-black text-white">
                        Срочно
                      </span>
                    )}

                    {activeItem.verified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-4 py-2 text-xs font-black text-blue-700 ring-1 ring-blue-100">
                        <CheckCircle2 size={14} />
                        Проверен
                      </span>
                    )}
                  </div>

                  <h3 className="mt-4 text-2xl font-black">
                    {activeItem.title || activeItem.name || "Исполнитель"}
                  </h3>

                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                    {activeItem.description || "Описание пока не указано."}
                  </p>

                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                      <UserRound size={18} className="text-blue-600" />
                      {getAuthor(activeItem)}
                    </div>

                    <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                      <MapPin size={18} className="text-blue-600" />
                      {getLocation(activeItem) || "Локация не указана"}
                    </div>

                    <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                      <Star size={18} className="text-blue-600" />
                      {getDistanceText(activeItem, userCoords, resolvedCoords)}
                    </div>

                    <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                      <Phone size={18} className="text-blue-600" />
                      {activeItem.phone || "Телефон в объявлении"}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3">
                    <Link
                      href={getProfileLink(activeItem)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0057ff] px-5 py-4 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:bg-[#0047d6]"
                    >
                      <UserRound size={18} />
                      Открыть профиль
                    </Link>

                    <Link
                      href={`/listing/${activeItem.id}`}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-50 px-5 py-4 text-sm font-black text-blue-700 ring-1 ring-blue-100 transition hover:bg-blue-100"
                    >
                      <MessageCircle size={18} />
                      Открыть объявление
                    </Link>
                  </div>
                </div>
              ) : (
                <p className="mt-5 text-sm font-semibold leading-6 text-slate-500">
                  Выбери метку на карте, и здесь появится профиль.
                </p>
              )}
            </div>

            <div className="rounded-[34px] bg-white p-5 shadow-sm ring-1 ring-blue-100">
              <h3 className="text-xl font-black">Список рядом</h3>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Те же результаты, что на карте.
              </p>

              <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">
                {filteredItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveId(item.id)}
                    className={`w-full rounded-3xl p-3 text-left transition ${
                      activeItem?.id === item.id
                        ? "bg-blue-50 ring-2 ring-blue-500"
                        : "bg-slate-50 ring-1 ring-slate-100 hover:bg-blue-50"
                    }`}
                  >
                    <div className="flex gap-3">
                      {getListingImage(item) ? (
                        <img
                          src={getListingImage(item)}
                          alt={item.title || "Профиль"}
                          className="h-16 w-16 rounded-2xl object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-500 ring-1 ring-blue-100">
                          <UserRound size={28} />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-slate-950">
                          {getAuthor(item)}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-slate-500">
                          {item.title || item.name || "Объявление"}
                        </p>
                        <p className="mt-1 text-xs font-black text-blue-700">
                          {getPrice(item)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
