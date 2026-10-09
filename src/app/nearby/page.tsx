"use client";

import { CATALOG_FORM_SECTIONS, getCatalogFormCategories, type CatalogSectionId } from "@/data/catalogForm";
import { getOfferActions, getOfferFeatures, getOfferGroup } from "@/lib/listingOffer";
import { mapProfileLink } from "@/lib/mapProfileLink";
import { db } from "@/lib/firebase";
import { isPublicationApproved } from "@/lib/moderation";
import {
  distanceLabel, escapeMapHtml, filterNearbyPublications, indexNearbyPublication, nearbyKey,
  normalizeCoordinates, priceLabel, priceNumber, publicationAddress, publicationAuthor,
  publicationCoordinates, publicationLink, publicationOwner,
  type Coordinates, type IndexedNearbyPublication, type NearbyAudience, type NearbyPublication, type NearbySort,
} from "@/lib/nearby";
import {
  AlertCircle, ArrowLeft, ArrowRight, BadgeCheck, Building2, Check, ChevronRight,
  ClipboardList, Compass, HardHat, ImageIcon, Layers3, List, Loader2, LocateFixed,
  Map as MapIcon, MapPin, Navigation, PackageOpen, RotateCcw, Search,
  SlidersHorizontal, Truck, UserRound, Wrench, X, Zap,
} from "lucide-react";
import Link from "next/link";
import { collection, doc, getDoc, limit, onSnapshot, query } from "firebase/firestore";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import styles from "./nearby.module.css";

declare global {
  interface Window { ymaps?: any; __stroikaYandexMapsPromise?: Promise<any>; }
}

const DEFAULT_CENTER: Coordinates = { lat: 56.326887, lng: 44.005986 };
const MAX_RESULTS = 250;
function motionDuration(duration: number) {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : duration;
}
function quietMapOperation(operation: () => any) {
  try { operation()?.then?.(() => {}, () => {}); } catch { /* Отмена движения не прерывает страницу. */ }
}
function geocodeWithTimeout(request: PromiseLike<any>) {
  return new Promise<any>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Geocode timeout")), 6000);
    Promise.resolve(request).then(value => { window.clearTimeout(timer); resolve(value); }, error => { window.clearTimeout(timer); reject(error); });
  });
}
function fitMapBounds(map: any, bounds: number[][], zoomMargin: number | number[] = 70, maxZoom = 14) {
  quietMapOperation(() => map.setBounds(bounds, { checkZoomRange: true, zoomMargin, duration: motionDuration(350) }).then(() => {
    // maxZoom — опция карты, не setBounds.
    try { if (map.getZoom() > maxZoom) quietMapOperation(() => map.setZoom(maxZoom)); } catch {}
  }, () => {}));
}
const SECTION_ICONS = { materials: PackageOpen, services: Wrench, equipment: Truck, solutions: Building2 };
const SOURCES = ["listings", "customerRequests"] as const;
const AUDIENCES: Array<{ id: NearbyAudience; label: string; Icon: typeof HardHat }> = [
  { id: "contractors", label: "Исполнители", Icon: HardHat },
  { id: "customers", label: "Заказчики", Icon: ClipboardList },
  { id: "all", label: "Все", Icon: Layers3 },
];

function loadYandexMaps(): Promise<any> {
  if (window.ymaps) return new Promise(resolve => window.ymaps.ready(() => resolve(window.ymaps)));
  if (window.__stroikaYandexMapsPromise) return window.__stroikaYandexMapsPromise;
  const promise = new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>('script[data-stroika-yandex-map="true"]');
    let created = false;
    const timer = window.setTimeout(() => fail(), 18000);
    const cleanup = () => {
      window.clearTimeout(timer);
      script?.removeEventListener("load", ready);
      script?.removeEventListener("error", fail);
    };
    const ready = () => {
      if (!window.ymaps) { fail(); return; }
      window.ymaps.ready(() => { cleanup(); resolve(window.ymaps); });
    };
    const fail = () => {
      cleanup();
      if (created) script?.remove();
      reject(new Error("Не удалось загрузить карту. Проверьте интернет и повторите попытку."));
    };
    if (!script) {
      created = true;
      script = document.createElement("script");
      const key = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;
      script.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU${key ? `&apikey=${encodeURIComponent(key)}` : ""}`;
      script.async = true;
      script.dataset.stroikaYandexMap = "true";
    }
    script.addEventListener("load", ready);
    script.addEventListener("error", fail);
    if (created) document.head.appendChild(script);
  });
  window.__stroikaYandexMapsPromise = promise;
  void promise.catch(() => {
    if (window.__stroikaYandexMapsPromise === promise) window.__stroikaYandexMapsPromise = undefined;
  });
  return promise;
}

function isOwnerVerified(profile: Record<string, unknown>) {
  return Boolean(profile.verified || profile.isVerified || profile.verificationStatus === "approved");
}

function profileLink(item: NearbyPublication) {
  return publicationOwner(item) ? mapProfileLink(item) : publicationLink(item);
}

function ResultImage({ entry, large = false }: { entry: IndexedNearbyPublication; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const Icon = entry.item.kind === "request" ? ClipboardList : SECTION_ICONS[entry.selection.section] || HardHat;
  useEffect(() => { setFailed(false); }, [entry.image]);
  return <div className={`${styles.resultImage} ${large ? styles.detailImage : ""}`} data-kind={entry.item.kind}>
    {entry.image && !failed
      ? <img src={entry.image} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      : <Icon size={large ? 34 : 27} strokeWidth={1.5} aria-hidden="true" />}
  </div>;
}

export default function NearbyPage() {
  const mapNodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const userPlacemarkRef = useRef<any>(null);
  const radiusRef = useRef<any>(null);
  const markersRef = useRef(new Map<string, any>());
  const indexedRef = useRef(new Map<string, IndexedNearbyPublication>());
  const focusUserRef = useRef(false);
  const fittedSignatureRef = useRef("");
  const geocodeAttemptsRef = useRef(new Set<string>());
  const ownerCacheRef = useRef(new Map<string, boolean>());
  const geoRequestRef = useRef(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const listNodeRef = useRef<HTMLDivElement>(null);
  const [sources, setSources] = useState<Record<string, NearbyPublication[]>>({});
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [sourceErrors, setSourceErrors] = useState<Record<string, boolean>>({});
  const [sourceLimited, setSourceLimited] = useState<Record<string, boolean>>({});
  const [ownersVerified, setOwnersVerified] = useState<Record<string, boolean>>({});
  const [dataRetry, setDataRetry] = useState(0);
  const [audience, setAudience] = useState<NearbyAudience>("contractors");
  const [activeKey, setActiveKey] = useState("");
  const [clusterKeys, setClusterKeys] = useState<string[]>([]);
  const [catalogSection, setCatalogSection] = useState<CatalogSectionId | "">("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [mainActions, setMainActions] = useState<string[]>([]);
  const [features, setFeatures] = useState<string[]>([]);
  const [city, setCity] = useState("");
  const [radius, setRadius] = useState<number | null>(null);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [onlyUrgent, setOnlyUrgent] = useState(false);
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [withPhoto, setWithPhoto] = useState(false);
  const [sort, setSort] = useState<NearbySort>("nearest");
  const [searchText, setSearchText] = useState("");
  const deferredSearch = useDeferredValue(searchText);
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [userCoords, setUserCoords] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoStatus, setGeoStatus] = useState("");
  const [resolvedCoords, setResolvedCoords] = useState<Record<string, Coordinates>>({});
  const [geocoding, setGeocoding] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [mapRetry, setMapRetry] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const items = useMemo(() => SOURCES.flatMap(source => sources[source] || []), [sources]);
  const isLoading = !SOURCES.every(source => loaded[source]);
  const limited = SOURCES.some(source => sourceLimited[source]);

  useEffect(() => {
    setLoaded({});
    setSourceErrors({});
    const unsubscribers = SOURCES.map(source => onSnapshot(query(collection(db, source), limit(MAX_RESULTS)), snapshot => {
      const kind = source === "listings" ? "contractor" : "request";
      const data = snapshot.docs.map(document => ({ ...document.data(), id: document.id, kind } as NearbyPublication))
        .filter(item => isPublicationApproved(item) && (kind !== "request" || !item.status || item.status === "active"));
      setSources(current => ({ ...current, [source]: data }));
      setSourceLimited(current => ({ ...current, [source]: snapshot.docs.length === MAX_RESULTS }));
      setLoaded(current => ({ ...current, [source]: true }));
      setSourceErrors(current => ({ ...current, [source]: false }));
    }, () => {
      setLoaded(current => ({ ...current, [source]: true }));
      setSourceErrors(current => ({ ...current, [source]: true }));
    }));
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [dataRetry]);

  useEffect(() => {
    let cancelled = false;
    const pending = [...new Set(items.map(publicationOwner).filter(Boolean))].filter(uid => !ownerCacheRef.current.has(uid));
    if (!pending.length) return;
    let cursor = 0;
    const updates: Record<string, boolean> = {};
    async function worker() {
      while (!cancelled && cursor < pending.length) {
        const uid = pending[cursor++];
        try {
          const snapshot = await getDoc(doc(db, "users", uid));
          if (cancelled) return;
          const verified = snapshot.exists() && isOwnerVerified(snapshot.data());
          ownerCacheRef.current.set(uid, verified);
          updates[uid] = verified;
        } catch { /* Карта остаётся доступной, даже если профиль временно не загрузился. */ }
      }
    }
    void Promise.all(Array.from({ length: Math.min(6, pending.length) }, () => worker())).then(() => {
      if (!cancelled) setOwnersVerified(current => ({ ...current, ...Object.fromEntries(ownerCacheRef.current), ...updates }));
    });
    return () => { cancelled = true; };
  }, [items]);

  useEffect(() => {
    let cancelled = false;
    let instance: any = null;
    let observer: ResizeObserver | null = null;
    setIsMapReady(false);
    setMapError("");
    async function init() {
      try {
        const ymaps = await loadYandexMaps();
        if (cancelled || !mapNodeRef.current) return;
        instance = new ymaps.Map(mapNodeRef.current, {
          center: [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], zoom: 11, controls: [],
        }, { suppressMapOpenBlock: true });
        instance.behaviors.disable("scrollZoom");
        mapRef.current = instance;
        fittedSignatureRef.current = "";
        observer = new ResizeObserver(() => instance?.container.fitToViewport());
        observer.observe(mapNodeRef.current);
        setIsMapReady(true);
      } catch {
        if (!cancelled) setMapError("Карта временно недоступна. Результаты можно посмотреть в списке.");
      }
    }
    void init();
    return () => {
      cancelled = true;
      observer?.disconnect();
      instance?.destroy();
      if (mapRef.current === instance) mapRef.current = null;
      clustererRef.current = null;
      userPlacemarkRef.current = null;
      radiusRef.current = null;
      markersRef.current.clear();
    };
  }, [mapRetry]);

  useEffect(() => () => { geoRequestRef.current += 1; }, []);

  useEffect(() => {
    if (!isMapReady) { setGeocoding(false); return; }
    let cancelled = false;
    const missing = items.filter(item => {
      const key = nearbyKey(item);
      return !publicationCoordinates(item) && !resolvedCoords[key] && !geocodeAttemptsRef.current.has(key) && publicationAddress(item).length >= 3;
    }).slice(0, 80);
    if (!missing.length) { setGeocoding(false); return; }
    setGeocoding(true);
    let cursor = 0;
    async function resolve() {
      const ymaps = await loadYandexMaps();
      async function worker() {
        while (!cancelled && cursor < missing.length) {
          const item = missing[cursor++];
          const key = nearbyKey(item);
          geocodeAttemptsRef.current.add(key);
          let coords: Coordinates | null = null;
          try {
            const result = await geocodeWithTimeout(ymaps.geocode(publicationAddress(item), { results: 1 }));
            const coordinates = result.geoObjects.get(0)?.geometry.getCoordinates();
            if (coordinates) coords = normalizeCoordinates(coordinates[0], coordinates[1]);
          } catch { /* Если JS-геокодер недоступен, пробуем существующий серверный API. */ }
          if (!coords && !cancelled) {
            const controller = new AbortController();
            const timer = window.setTimeout(() => controller.abort(), 8000);
            try {
              const response = await fetch(`/api/geocode?address=${encodeURIComponent(publicationAddress(item))}`, { signal: controller.signal });
              if (response.ok) {
                const data = await response.json();
                coords = normalizeCoordinates(data.lat, data.lng);
              }
            } catch { /* Не придумываем координаты, если адрес не определился. */ }
            finally { window.clearTimeout(timer); }
          }
          if (cancelled) { geocodeAttemptsRef.current.delete(key); return; }
          if (coords) setResolvedCoords(current => ({ ...current, [key]: coords! }));
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, missing.length) }, () => worker()));
    }
    void resolve().catch(() => {}).finally(() => { if (!cancelled) setGeocoding(false); });
    return () => { cancelled = true; };
    // resolvedCoords меняются во время очереди; не запускаем её заново на каждом ответе.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, isMapReady]);

  const indexedItems = useMemo(() => items.map(item => indexNearbyPublication(item,
    publicationCoordinates(item) || resolvedCoords[nearbyKey(item)] || null, userCoords, ownersVerified[publicationOwner(item)])),
  [items, resolvedCoords, userCoords, ownersVerified]);
  indexedRef.current = new Map(indexedItems.map(entry => [entry.key, entry]));
  const filteredItems = useMemo(() => filterNearbyPublications(indexedItems, {
    audience, section: catalogSection, categoryId, subcategory, search: deferredSearch, city,
    radius, hasOrigin: Boolean(userCoords), mainActions, features, priceMin, priceMax,
    onlyVerified, onlyUrgent, withPhoto, sort,
  }), [indexedItems, audience, catalogSection, categoryId, subcategory, deferredSearch, city, radius, userCoords, mainActions, features, priceMin, priceMax, onlyVerified, onlyUrgent, withPhoto, sort]);
  const mapItems = useMemo(() => filteredItems.filter(entry => entry.coords), [filteredItems]);
  const activeItem = filteredItems.find(entry => entry.key === activeKey) || null;
  const clusterItems = filteredItems.filter(entry => clusterKeys.includes(entry.key));
  const cities = useMemo(() => [...new Set(items.map(item => item.city || "").filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")), [items]);
  const catalogCategories = useMemo(() => catalogSection ? getCatalogFormCategories(catalogSection) : [], [catalogSection]);
  const selectedCategory = catalogCategories.find(option => option.id === categoryId);
  const selectedSection = CATALOG_FORM_SECTIONS.find(option => option.id === catalogSection);
  const offerGroups = catalogSection ? [getOfferGroup("", catalogSection)] : ["materials", "services", "equipment", "complex"] as const;
  const actionOptions = offerGroups.flatMap(group => getOfferActions(group));
  const featureOptions = [...new Map(offerGroups.flatMap(group => getOfferFeatures(group)).map(feature => [feature.id, feature])).values()];
  const filterCount = [catalogSection, categoryId, subcategory, city, radius !== null,
    mainActions.length > 0, features.length > 0, priceMin || priceMax, onlyVerified, onlyUrgent, withPhoto].filter(Boolean).length;
  const invalidPriceRange = priceNumber(priceMin) !== null && priceNumber(priceMax) !== null && priceNumber(priceMin)! > priceNumber(priceMax)!;
  const mapSignature = mapItems.map(entry => `${entry.key}:${entry.coords?.lat}:${entry.coords?.lng}`).join("|");

  useEffect(() => {
    if (activeKey && !filteredItems.some(entry => entry.key === activeKey)) setActiveKey("");
  }, [activeKey, filteredItems]);
  useEffect(() => { setClusterKeys([]); }, [audience, catalogSection, categoryId, subcategory, deferredSearch, city, radius, mainActions, features, onlyVerified, onlyUrgent, withPhoto, priceMin, priceMax]);

  const selectMapItem = useCallback((key: string) => {
    focusUserRef.current = false;
    setActiveKey(key);
    setClusterKeys([]);
    setViewMode("map");
    const entry = indexedRef.current.get(key);
    if (entry?.coords && mapRef.current) {
      const map = mapRef.current;
      map.margin.setDefaultMargin([40, 40, 250, 40]);
      quietMapOperation(() => map.setCenter([entry.coords!.lat, entry.coords!.lng], Math.max(map.getZoom(), 13), { duration: motionDuration(350), useMapMargin: true }));
    }
    const result = Array.from(listNodeRef.current?.querySelectorAll<HTMLElement>("[data-result-key]") || []).find(node => node.dataset.resultKey === key);
    if (result && listNodeRef.current) {
      listNodeRef.current.scrollTo({ top: result.offsetTop - listNodeRef.current.offsetTop - 12, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    }
  }, []);

  function fitResults() {
    const map = mapRef.current;
    if (!map) return;
    const bounds = clustererRef.current?.getBounds();
    if (bounds) fitMapBounds(map, bounds, [60, 60, 240, 60], 15);
    else if (userCoords) quietMapOperation(() => map.setCenter([userCoords.lat, userCoords.lng], 13, { duration: motionDuration(350) }));
  }

  useEffect(() => {
    if (!isMapReady || !mapRef.current) return;
    const ymaps = window.ymaps;
    const map = mapRef.current;
    if (!ymaps) return;
    if (clustererRef.current) map.geoObjects.remove(clustererRef.current);
    markersRef.current.clear();
    const layouts = {
      contractor: ymaps.templateLayoutFactory.createClass(`<div class="${styles.mapPin}" data-kind="contractor" data-active="{{ properties.selected }}">И</div>`),
      request: ymaps.templateLayoutFactory.createClass(`<div class="${styles.mapPin}" data-kind="request" data-active="{{ properties.selected }}">З</div>`),
    };
    const placemarks = mapItems.map(entry => {
      const coords = entry.coords!;
      const marker = new ymaps.Placemark([coords.lat, coords.lng], {
        hintContent: escapeMapHtml(entry.item.title || entry.item.name || publicationAuthor(entry.item)),
        selected: "false",
        publicationKey: entry.key,
      }, {
        iconLayout: layouts[entry.item.kind], iconShape: { type: "Circle", coordinates: [0, -18], radius: 24 },
        openBalloonOnClick: false, zIndex: 600,
      });
      marker.events.add("click", () => selectMapItem(entry.key));
      markersRef.current.set(entry.key, marker);
      return marker;
    });
    const clusterer = new ymaps.Clusterer({
      preset: "islands#blueClusterIcons", groupByCoordinates: false,
      clusterDisableClickZoom: true, clusterOpenBalloonOnClick: false,
      clusterIconLayout: ymaps.templateLayoutFactory.createClass(`<div class="${styles.mapCluster}">{{ properties.geoObjects.length }}</div>`),
      clusterIconShape: { type: "Circle", coordinates: [0, 0], radius: 24 },
    });
    clusterer.add(placemarks);
    clusterer.events.add("click", (event: any) => {
      const group = event.get("target")?.properties?.get("geoObjects");
      if (!Array.isArray(group)) return;
      setActiveKey("");
      setClusterKeys(group.map((marker: any) => marker.properties.get("publicationKey")).filter(Boolean));
    });
    clustererRef.current = clusterer;
    map.geoObjects.add(clusterer);
    if (fittedSignatureRef.current !== mapSignature) {
      fittedSignatureRef.current = mapSignature;
      if (!focusUserRef.current && placemarks.length) {
        const bounds = clusterer.getBounds();
        if (bounds) fitMapBounds(map, bounds);
      }
    }
    return () => { if (mapRef.current === map) map.geoObjects.remove(clusterer); };
  }, [mapItems, isMapReady, selectMapItem, mapSignature]);

  useEffect(() => {
    markersRef.current.forEach((marker, key) => {
      marker.properties.set("selected", key === activeKey ? "true" : "false");
      marker.options.set("zIndex", key === activeKey ? 1000 : 600);
    });
  }, [activeKey, mapItems, isMapReady]);
  useEffect(() => { if (!activeKey) mapRef.current?.margin.setDefaultMargin(0); }, [activeKey]);

  useEffect(() => {
    const map = mapRef.current;
    const ymaps = window.ymaps;
    if (!isMapReady || !map || !ymaps) return;
    if (userPlacemarkRef.current) map.geoObjects.remove(userPlacemarkRef.current);
    if (radiusRef.current) map.geoObjects.remove(radiusRef.current);
    userPlacemarkRef.current = null;
    radiusRef.current = null;
    if (!userCoords) return;
    const point = [userCoords.lat, userCoords.lng];
    userPlacemarkRef.current = new ymaps.Placemark(point, { hintContent: "Вы здесь" }, {
      preset: "islands#blueCircleDotIcon", zIndex: 1100,
    });
    map.geoObjects.add(userPlacemarkRef.current);
    if (radius !== null) {
      radiusRef.current = new ymaps.Circle([point, radius * 1000], {}, {
        fillColor: "#0057ff", fillOpacity: 0.05, strokeColor: "#0057ff", strokeOpacity: 0.38,
        strokeWidth: 2, strokeStyle: "dash", interactivityModel: "default#transparent",
      });
      map.geoObjects.add(radiusRef.current);
      const bounds = radiusRef.current.geometry.getBounds();
      if (bounds) fitMapBounds(map, bounds, 50);
    } else if (focusUserRef.current) quietMapOperation(() => map.setCenter(point, 14, { duration: motionDuration(350) }));
  }, [userCoords, radius, isMapReady]);

  function useMyLocation() {
    if (locating) return;
    if (!navigator.geolocation) { setGeoStatus("Геопозиция недоступна в этом браузере. Выберите город в фильтрах."); return; }
    setLocating(true);
    setGeoStatus("");
    const requestId = ++geoRequestRef.current;
    navigator.geolocation.getCurrentPosition(position => {
      if (requestId !== geoRequestRef.current) return;
      const coords = normalizeCoordinates(position.coords.latitude, position.coords.longitude);
      setLocating(false);
      if (!coords) { setGeoStatus("Не удалось определить геопозицию. Попробуйте ещё раз."); return; }
      focusUserRef.current = true;
      setCity("");
      setUserCoords(coords);
      setGeoStatus("Геопозиция определена. Расстояния рассчитаны от вас.");
      if (mapRef.current) quietMapOperation(() => mapRef.current.setCenter([coords.lat, coords.lng], 14, { duration: motionDuration(350) }));
    }, error => {
      if (requestId !== geoRequestRef.current) return;
      setLocating(false);
      setGeoStatus(error.code === 1 ? "Доступ к геопозиции закрыт. Разрешите его в настройках браузера или выберите город."
        : error.code === 3 ? "Геопозиция пока не определилась. Повторите попытку или выберите город."
          : "Не удалось определить местоположение. Проверьте геолокацию и попробуйте ещё раз.");
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  function selectRadius(value: number | null) {
    focusUserRef.current = false;
    setRadius(value);
    if (value !== null && !userCoords) useMyLocation();
  }

  function resetFilters() {
    setCatalogSection(""); setCategoryId(""); setSubcategory(""); setMainActions([]); setFeatures([]);
    setCity(""); setRadius(null); setPriceMin(""); setPriceMax(""); setSearchText("");
    setOnlyUrgent(false); setOnlyVerified(false); setWithPhoto(false); setSort("nearest"); setActiveKey(""); setClusterKeys([]);
    focusUserRef.current = false;
  }

  function openFilters() { setFiltersOpen(true); dialogRef.current?.showModal(); }
  function closeFilters() { dialogRef.current?.close(); setFiltersOpen(false); filtersButtonRef.current?.focus(); }

  useEffect(() => {
    if (!filtersOpen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, [filtersOpen]);

  const missingCount = filteredItems.length - mapItems.length;
  const resultsLabel = audience === "customers" ? "Заявки заказчиков" : audience === "all" ? "Все объявления" : "Исполнители";

  return <main className={styles.page}>
    <div className={styles.container}>
      <header className={styles.heading}>
        <div className={styles.titleGroup}>
          <Link href="/" className={styles.backButton} aria-label="Вернуться на главную"><ArrowLeft size={20} /></Link>
          <div><p className={styles.eyebrow}><Navigation size={13} /> Люди и задачи на одной карте</p><h1>Исполнитель рядом<span className={styles.titleDot} /></h1></div>
        </div>
        <div className={styles.headingAside}><span className={styles.liveDot} /> Объявления обновляются онлайн</div>
      </header>

      <section className={styles.commandBar} aria-label="Поиск на карте">
        <div className={styles.searchField}>
          <Search size={21} aria-hidden="true" />
          <input aria-label="Поиск исполнителей и заявок" value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Услуга, материал или техника" autoComplete="off" />
          {searchText && <button type="button" className={styles.clearSearch} onClick={() => setSearchText("")} aria-label="Очистить поиск"><X size={17} /></button>}
          <span className={styles.searchIndicator} data-loading={searchText !== deferredSearch} aria-hidden="true" />
        </div>
        <div className={styles.audienceSwitch} role="group" aria-label="Кого показывать" style={{ "--segment-index": AUDIENCES.findIndex(value => value.id === audience) } as CSSProperties}>
          <span className={styles.segmentThumb} />
          {AUDIENCES.map(({ id, label, Icon }) => <button key={id} type="button" aria-pressed={audience === id} onClick={() => { setAudience(id); setActiveKey(""); setClusterKeys([]); if (id === "customers") { setMainActions([]); setFeatures([]); } focusUserRef.current = false; }}><Icon size={17} /><span>{label}</span></button>)}
        </div>
        <div className={styles.commandActions}>
          <button type="button" className={styles.locationButton} onClick={useMyLocation} disabled={locating} aria-busy={locating}>
            {locating ? <Loader2 size={19} className={styles.spin} /> : <LocateFixed size={19} />}<span>{locating ? "Определяем…" : "Моя геопозиция"}</span>
          </button>
          <button type="button" ref={filtersButtonRef} className={styles.filtersButton} onClick={openFilters} aria-haspopup="dialog" aria-expanded={filtersOpen}>
            <SlidersHorizontal size={19} /> Фильтры {filterCount > 0 && <span className={styles.filterBadge}>{filterCount}</span>}
          </button>
        </div>
      </section>

      <div className={styles.scopeBar}>
        <div className={styles.scopeChips}>
          {catalogSection ? <button type="button" className={styles.scopeChip} onClick={() => { setCatalogSection(""); setCategoryId(""); setSubcategory(""); setMainActions([]); setFeatures([]); }}><Layers3 size={14} />{selectedSection?.title}<X size={13} /></button>
            : <button type="button" className={styles.scopeChip} onClick={openFilters}><Layers3 size={14} />Все каталоги<ChevronRight size={14} /></button>}
          {categoryId && <button type="button" className={styles.scopeChip} onClick={() => { setCategoryId(""); setSubcategory(""); }}>{selectedCategory?.title}<X size={13} /></button>}
          {subcategory && <button type="button" className={styles.scopeChip} onClick={() => setSubcategory("")}>{subcategory}<X size={13} /></button>}
          {city && <button type="button" className={styles.scopeChip} onClick={() => setCity("")}><MapPin size={14} />{city}<X size={13} /></button>}
          {radius !== null && <button type="button" className={styles.scopeChip} data-pending={!userCoords} onClick={() => selectRadius(null)}><LocateFixed size={14} />{radius} км{!userCoords && " · нужна геопозиция"}<X size={13} /></button>}
          {onlyVerified && <button type="button" className={styles.scopeChip} onClick={() => setOnlyVerified(false)}><BadgeCheck size={14} />Проверенные<X size={13} /></button>}
          {onlyUrgent && <button type="button" className={styles.scopeChip} onClick={() => setOnlyUrgent(false)}><Zap size={14} />Срочные<X size={13} /></button>}
          {withPhoto && <button type="button" className={styles.scopeChip} onClick={() => setWithPhoto(false)}><ImageIcon size={14} />С фото<X size={13} /></button>}
          {(priceMin || priceMax) && <button type="button" className={styles.scopeChip} onClick={() => { setPriceMin(""); setPriceMax(""); }}>{priceMin ? `от ${priceMin}` : ""}{priceMin && priceMax ? " · " : ""}{priceMax ? `до ${priceMax}` : ""} ₽<X size={13} /></button>}
          {mainActions.length > 0 && <button type="button" className={styles.scopeChip} onClick={() => setMainActions([])}>Основные варианты · {mainActions.length}<X size={13} /></button>}
          {features.length > 0 && <button type="button" className={styles.scopeChip} onClick={() => setFeatures([])}>Дополнительно · {features.length}<X size={13} /></button>}
          {filterCount > 0 && <button type="button" className={styles.resetLink} onClick={resetFilters}>Сбросить</button>}
        </div>
        <div className={styles.viewSwitch} role="group" aria-label="Вид результатов">
          <button type="button" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")}><List size={16} />Список</button>
          <button type="button" aria-pressed={viewMode === "map"} onClick={() => setViewMode("map")}><MapIcon size={16} />Карта</button>
        </div>
      </div>

      {(geoStatus || Object.values(sourceErrors).some(Boolean)) && <div className={styles.statusBar} role="status">
        <AlertCircle size={16} /><span>{Object.values(sourceErrors).some(Boolean) ? "Часть объявлений не удалось загрузить. Доступные результаты уже показаны." : geoStatus}</span>
        {Object.values(sourceErrors).some(Boolean) ? <button type="button" onClick={() => setDataRetry(value => value + 1)}>Повторить</button> : <button type="button" onClick={() => setGeoStatus("")} aria-label="Скрыть сообщение"><X size={16} /></button>}
      </div>}

      <section className={styles.workspace} data-view={viewMode} aria-label="Результаты поиска рядом">
        <aside className={styles.resultsPanel}>
          <div className={styles.resultsHeading}>
            <div><span className={styles.smallEyebrow}>{resultsLabel}</span><h2 aria-live="polite">{isLoading ? "Ищем рядом…" : `${filteredItems.length} найдено`}</h2></div>
            <div className={styles.resultsIcon}><Compass size={25} strokeWidth={1.5} /></div>
          </div>
          <div className={styles.sortRow}>
            <span>{userCoords ? <><span className={styles.liveDot} />От вашей геопозиции</> : <><MapPin size={13} />{city || "Все города"}</>}</span>
            <select aria-label="Сортировка результатов" value={sort} onChange={event => setSort(event.target.value as NearbySort)}>
              <option value="nearest">{deferredSearch.trim() ? "По релевантности" : "Сначала рядом"}</option><option value="newest">Сначала новые</option><option value="priceAsc">Дешевле</option><option value="priceDesc">Дороже</option>
            </select>
          </div>
          <div ref={listNodeRef} className={styles.resultList} aria-busy={isLoading || searchText !== deferredSearch}>
            {isLoading && items.length === 0 ? Array.from({ length: 5 }, (_, index) => <div key={index} className={styles.skeletonCard} aria-hidden="true"><span /><div><i /><i /><i /></div></div>)
              : filteredItems.length ? filteredItems.map((entry, index) => <button key={entry.key} type="button" data-result-key={entry.key} className={styles.resultCard} data-selected={entry.key === activeKey} aria-pressed={entry.key === activeKey} onClick={() => selectMapItem(entry.key)} style={{ "--reveal-delay": `${Math.min(index, 6) * 35}ms` } as CSSProperties}>
                <ResultImage entry={entry} />
                <div className={styles.resultBody}>
                  <div className={styles.resultMeta}><span className={styles.roleLabel} data-kind={entry.item.kind}>{entry.item.kind === "request" ? "Заказчик" : "Исполнитель"}</span>{entry.verified && <BadgeCheck size={14} aria-label="Проверен" />}{entry.urgent && <span className={styles.urgentLabel}><Zap size={11} />Срочно</span>}</div>
                  <h3>{entry.item.title || entry.item.name || "Объявление"}</h3>
                  <p>{publicationAuthor(entry.item)}</p>
                  <div className={styles.resultBottom}><strong>{priceLabel(entry.item)}</strong><span><MapPin size={11} />{entry.distance !== null ? distanceLabel(entry.distance).replace(" от вас", "") : entry.item.city || "Город не указан"}</span></div>
                  {!entry.coords && <span className={styles.noCoords}>Пока без точки на карте</span>}
                </div><ChevronRight size={15} className={styles.resultArrow} />
              </button>) : <div className={styles.emptyState}><div className={styles.emptyIcon}><Search size={27} strokeWidth={1.5} /></div><h3>Пока ничего не найдено</h3><p>Попробуйте другой запрос, увеличьте радиус или уберите часть фильтров.</p><button type="button" className={styles.primaryButton} onClick={resetFilters}>Сбросить фильтры<ArrowRight size={16} /></button></div>}
          </div>
          <div className={styles.resultsFooter}><span className={styles.liveDot} />{geocoding ? "Уточняем точки по адресам…" : limited ? "Показана доступная выборка. Уточните фильтры." : "Только опубликованные объявления"}</div>
        </aside>

        <div className={styles.mapPanel}>
          <div ref={mapNodeRef} className={styles.mapCanvas} aria-label="Карта исполнителей и заявок заказчиков" />
          <div className={styles.mapLegend}><span><i className={styles.contractorDot} />Исполнители</span><span><i className={styles.customerDot} />Заказчики</span></div>
          <div className={styles.mapControls}>
            <button type="button" onClick={useMyLocation} disabled={locating || !isMapReady} aria-label="Показать моё местоположение" title="Моя геопозиция">{locating ? <Loader2 size={20} className={styles.spin} /> : <LocateFixed size={21} />}</button>
            <div className={styles.zoomControls}><button type="button" disabled={!isMapReady} onClick={() => quietMapOperation(() => mapRef.current?.setZoom(Math.min(19, mapRef.current.getZoom() + 1), { duration: motionDuration(200) }))} aria-label="Приблизить карту">+</button><button type="button" disabled={!isMapReady} onClick={() => quietMapOperation(() => mapRef.current?.setZoom(Math.max(2, mapRef.current.getZoom() - 1), { duration: motionDuration(200) }))} aria-label="Отдалить карту">−</button></div>
            <button type="button" onClick={() => { focusUserRef.current = false; fitResults(); }} disabled={!isMapReady} aria-label="Показать все найденные метки" title="Все найденные метки"><Layers3 size={20} /></button>
          </div>
          {(!isMapReady || mapError) && <div className={styles.mapLoading}><div className={styles.mapLoadingCard}>
            {mapError ? <AlertCircle size={30} /> : <div className={styles.loadingCompass}><Compass size={38} strokeWidth={1.4} /></div>}
            <h3>{mapError ? "Не получилось открыть карту" : "Прокладываем путь"}</h3><p>{mapError || "Загружаем карту и собираем объявления рядом."}</p>
            {mapError && <button type="button" className={styles.primaryButton} onClick={() => setMapRetry(value => value + 1)}><RotateCcw size={16} />Повторить</button>}
          </div></div>}
          {isMapReady && !isLoading && !activeItem && !clusterItems.length && <div className={styles.mapHint}><MapPin size={17} /><span>{mapItems.length ? `На карте ${mapItems.length} · нажмите на метку` : "По этим фильтрам нет точек на карте"}{missingCount > 0 && ` · ещё ${missingCount} в списке`}</span>{!mapItems.length && <button type="button" onClick={resetFilters}>Сбросить</button>}</div>}
          {!activeItem && clusterItems.length > 0 && <article className={`${styles.detailCard} ${styles.clusterCard}`} aria-label="Объявления в группе">
            <button type="button" className={styles.closeDetail} onClick={() => setClusterKeys([])} aria-label="Закрыть группу"><X size={17} /></button>
            <h3 className={styles.clusterHeading}>В этой группе · {clusterItems.length}</h3>
            <p className={styles.filterHelp}>Выберите объявление, чтобы открыть карточку.</p>
            <div className={styles.clusterList}>{clusterItems.map(entry => <button key={entry.key} type="button" className={styles.clusterResult} onClick={() => selectMapItem(entry.key)}><ResultImage entry={entry} /><span><b>{entry.item.title || "Объявление"}</b><small>{entry.item.kind === "request" ? "Заказчик" : "Исполнитель"} · {priceLabel(entry.item)}</small></span><ChevronRight size={15} /></button>)}</div>
          </article>}
          {activeItem && <article key={activeItem.key} className={styles.detailCard} aria-label="Выбранное объявление">
            <button type="button" className={styles.closeDetail} onClick={() => setActiveKey("")} aria-label="Закрыть карточку"><X size={17} /></button>
            <div className={styles.detailTop}><ResultImage entry={activeItem} large /><div className={styles.detailBody}>
              <div className={styles.resultMeta}><span className={styles.roleLabel} data-kind={activeItem.item.kind}>{activeItem.item.kind === "request" ? "Заявка заказчика" : "Исполнитель"}</span>{activeItem.verified && <span className={styles.verifiedLabel}><BadgeCheck size={14} />Проверен</span>}</div>
              <h3>{activeItem.item.title || activeItem.item.name || "Объявление"}</h3><p>{publicationAuthor(activeItem.item)}</p><strong>{priceLabel(activeItem.item)}</strong>
            </div></div>
            <div className={styles.detailLocation}><MapPin size={15} /><span>{publicationAddress(activeItem.item) || "Адрес не указан"}</span>{activeItem.distance !== null && <b>{distanceLabel(activeItem.distance)}</b>}</div>
            {!activeItem.coords && <p className={styles.noCoords}>Точка не определена — адрес можно уточнить в объявлении.</p>}
            <div className={styles.detailLinks}><Link href={publicationLink(activeItem.item)} className={styles.primaryButton}>{activeItem.item.kind === "request" ? "Посмотреть заявку" : "Открыть объявление"}<ArrowRight size={16} /></Link><Link href={profileLink(activeItem.item)} className={styles.secondaryButton}><UserRound size={16} />Профиль</Link></div>
          </article>}
        </div>
      </section>
      <div className={styles.bottomNote}><span><MapPin size={14} />И — исполнитель · З — заказчик · число — группа объявлений</span><span>Найдите подходящих людей. Договоритесь о работе.</span></div>
    </div>

    <dialog ref={dialogRef} className={styles.filterDialog} aria-labelledby="nearby-filter-title" onCancel={() => setFiltersOpen(false)} onClose={() => setFiltersOpen(false)} onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeFilters(); } }}>
      <div className={styles.filterHeader}><div><p className={styles.eyebrow}>Точный поиск</p><h2 id="nearby-filter-title">Фильтры рядом</h2></div><button type="button" className={styles.iconButton} onClick={closeFilters} aria-label="Закрыть фильтры"><X size={22} /></button></div>
      <div className={styles.filterContent}>
        <fieldset className={styles.filterSection}><legend><Layers3 size={17} />Каталог</legend>
          <div className={styles.catalogGrid}><button type="button" className={styles.catalogButton} data-active={!catalogSection} aria-pressed={!catalogSection} onClick={() => { setCatalogSection(""); setCategoryId(""); setSubcategory(""); setMainActions([]); setFeatures([]); }}><Layers3 size={20} /><span>Все каталоги</span>{!catalogSection && <Check size={15} />}</button>
            {CATALOG_FORM_SECTIONS.map(section => { const Icon = SECTION_ICONS[section.id]; return <button key={section.id} type="button" className={styles.catalogButton} data-active={catalogSection === section.id} aria-pressed={catalogSection === section.id} onClick={() => { setCatalogSection(section.id); setCategoryId(""); setSubcategory(""); setMainActions([]); setFeatures([]); }}><Icon size={20} /><span>{section.title}</span>{catalogSection === section.id && <Check size={15} />}</button>; })}
          </div>
          {catalogSection && <div className={styles.catalogLevels}>
            <label>Категория<select value={categoryId} onChange={event => { setCategoryId(event.target.value); setSubcategory(""); }}><option value="">Все категории</option>{catalogCategories.map(option => <option key={option.id} value={option.id}>{option.title}</option>)}</select></label>
            {selectedCategory && <label>Подкатегория<select value={subcategory} onChange={event => setSubcategory(event.target.value)}><option value="">Все подкатегории</option>{selectedCategory.subcategories.map(option => <option key={option} value={option}>{option}</option>)}</select></label>}
          </div>}
        </fieldset>

        {audience !== "customers" && <>
          <fieldset className={styles.filterSection}><legend><Wrench size={17} />Основные варианты</legend><p className={styles.filterHelp}>Можно выбрать несколько. Покажем любой из выбранных вариантов.</p><div className={styles.optionChips}>{actionOptions.map(action => <button key={action.id} type="button" aria-pressed={mainActions.includes(action.id)} data-active={mainActions.includes(action.id)} onClick={() => setMainActions(current => current.includes(action.id) ? current.filter(id => id !== action.id) : [...current, action.id])}>{mainActions.includes(action.id) && <Check size={14} />}{action.label}</button>)}</div></fieldset>
          <fieldset className={styles.filterSection}><legend><SlidersHorizontal size={17} />Дополнительные возможности</legend><div className={styles.optionChips}>{featureOptions.map(feature => <button key={feature.id} type="button" aria-pressed={features.includes(feature.id)} data-active={features.includes(feature.id)} onClick={() => setFeatures(current => current.includes(feature.id) ? current.filter(id => id !== feature.id) : [...current, feature.id])}>{features.includes(feature.id) && <Check size={14} />}{feature.label}</button>)}</div>{audience === "all" && <p className={styles.filterHelp}>Основные и дополнительные варианты фильтруют только исполнителей, не заявки.</p>}</fieldset>
        </>}

        <fieldset className={styles.filterSection}><legend><MapPin size={17} />Где искать</legend>
          <label className={styles.fieldLabel}>Город или район<input list="nearby-cities" value={city} onChange={event => setCity(event.target.value)} placeholder="Например, Нижний Новгород" /><datalist id="nearby-cities">{cities.map(value => <option key={value} value={value} />)}</datalist></label>
          <span className={styles.fieldLabel}>Расстояние от вас</span><div className={styles.optionChips}>{[5, 10, 25, 50, 100].map(value => <button key={value} type="button" aria-pressed={radius === value} data-active={radius === value} onClick={() => selectRadius(value)}>{radius === value && <Check size={14} />}{value} км</button>)}<button type="button" aria-pressed={radius === null} data-active={radius === null} onClick={() => selectRadius(null)}>Без ограничения</button></div>
          {radius !== null && !userCoords ? <div className={styles.locationNotice}><LocateFixed size={18} /><div><p>Для радиуса нужна ваша геопозиция</p><span>Пока она не определена, расстояние не ограничивает результаты.</span><button type="button" onClick={useMyLocation} disabled={locating}>{locating ? "Определяем…" : "Разрешить геопозицию"}<ArrowRight size={13} /></button>{geoStatus && <span role="status">{geoStatus}</span>}</div></div> : userCoords && <p className={styles.filterHelp}>Расстояние по прямой от вашей геопозиции, не длина маршрута.</p>}
        </fieldset>

        <fieldset className={styles.filterSection}><legend>Цена или бюджет, ₽</legend><div className={styles.priceFields}><label>От<input inputMode="decimal" value={priceMin} onChange={event => setPriceMin(event.target.value)} placeholder="Любая" aria-invalid={invalidPriceRange} /></label><span>—</span><label>До<input inputMode="decimal" value={priceMax} onChange={event => setPriceMax(event.target.value)} placeholder="Без лимита" aria-invalid={invalidPriceRange} /></label></div>{invalidPriceRange && <p className={styles.validationError} role="alert">Цена «от» не должна быть больше цены «до».</p>}</fieldset>

        <fieldset className={styles.filterSection}><legend>Дополнительно</legend>
          {[{ label: "Только проверенные", help: "Профиль прошёл проверку", checked: onlyVerified, change: setOnlyVerified, Icon: BadgeCheck }, { label: "Только срочные", help: "В объявлении отмечена срочность", checked: onlyUrgent, change: setOnlyUrgent, Icon: Zap }, { label: "Только с фотографией", help: "Можно сразу увидеть предложение", checked: withPhoto, change: setWithPhoto, Icon: ImageIcon }].map(({ label, help, checked, change, Icon }) => <label key={label} className={styles.toggleRow}><Icon size={20} /><span><b>{label}</b><small>{help}</small></span><input type="checkbox" checked={checked} onChange={event => change(event.target.checked)} /><i className={styles.toggleTrack} /></label>)}
        </fieldset>
      </div>
      <div className={styles.filterFooter}><button type="button" className={styles.secondaryButton} onClick={resetFilters}><RotateCcw size={16} />Сбросить</button><button type="button" className={styles.primaryButton} onClick={closeFilters} disabled={invalidPriceRange}>Показать {filteredItems.length}<ArrowRight size={17} /></button></div>
    </dialog>
  </main>;
}
