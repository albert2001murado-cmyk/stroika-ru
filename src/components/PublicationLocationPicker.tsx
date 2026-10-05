"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, LocateFixed, Map as MapIcon } from "lucide-react";
import { getApiUrl } from "@/lib/getApiUrl";
import { cityFromAddress } from "@/lib/geocodeCity";

export type PublicationLocation = { lat: number; lng: number; address: string };
type Props = { city: string; address: string; onCity: (value: string) => void; onAddress: (value: string) => void; onLocation: (value: PublicationLocation | null) => void; onBusy: (value: boolean) => void };

let mapsPromise: Promise<any> | null = null;
function loadMaps() {
  const win = window as any;
  if (win.ymaps) return new Promise<any>(resolve => win.ymaps.ready(() => resolve(win.ymaps)));
  if (win.__stroikaYandexMapsPromise) return win.__stroikaYandexMapsPromise as Promise<any>;
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(() => { script.remove(); mapsPromise = null; reject(new Error("Карта загружается слишком долго. Попробуйте ещё раз.")); }, 15000);
    script.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU&apikey=${encodeURIComponent(process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY || "")}`;
    script.dataset.stroikaYandexMap = "true";
    script.async = true;
    script.onload = () => { clearTimeout(timer); if (!win.ymaps) { mapsPromise = null; reject(new Error("Не удалось загрузить карту.")); return; } win.ymaps.ready(() => resolve(win.ymaps)); };
    script.onerror = () => { clearTimeout(timer); script.remove(); mapsPromise = null; reject(new Error("Не удалось загрузить карту. Проверьте подключение.")); };
    document.head.appendChild(script);
  });
  return mapsPromise;
}

async function geocode(address: string) {
  const response = await fetch(getApiUrl(`/api/geocode?address=${encodeURIComponent(address)}`), { signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  if (!response.ok || !data.ok || !Number.isFinite(data.lat) || !Number.isFinite(data.lng)) throw new Error("Не удалось определить адрес. Переместите метку или введите адрес вручную.");
  return data as PublicationLocation & { city: string };
}

export default function PublicationLocationPicker(props: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [candidate, setCandidate] = useState<(PublicationLocation & { city: string }) | null>(null);
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const marker = useRef<any>(null);
  const api = useRef<any>(null);
  const latest = useRef(props); latest.current = props;
  const revision = useRef(0);
  useEffect(() => { props.onBusy(busy); }, [busy, props.onBusy]);

  function place(lat: number, lng: number) {
    if (!map.current || !api.current) return;
    if (!marker.current) {
      marker.current = new api.current.Placemark([lat, lng], {}, { draggable: true, preset: "islands#blueDotIcon" });
      marker.current.events.add("dragend", () => { const [a, b] = marker.current.geometry.getCoordinates(); void select(a, b); });
      map.current.geoObjects.add(marker.current);
    } else marker.current.geometry.setCoordinates([lat, lng]);
  }

  async function select(lat: number, lng: number) {
    const token = ++revision.current;
    place(lat, lng); setBusy(true); setError(""); setCandidate(null);
    try {
      const result = await geocode(`${lng},${lat}`);
      if (token !== revision.current) return;
      setCandidate({ lat, lng, address: result.address, city: result.city || cityFromAddress(result.address) });
    } catch (e) { if (token === revision.current) { marker.current && map.current?.geoObjects.remove(marker.current); marker.current = null; setError((e as Error).message); } }
    finally { if (token === revision.current) setBusy(false); }
  }

  useEffect(() => {
    if (!open) { setBusy(false); return; }
    let cancelled = false;
    setBusy(true); setError(""); setReady(false); setCandidate(null); setQuery([latest.current.city, latest.current.address].filter(Boolean).join(", "));
    (async () => {
      try {
        const ymaps = await loadMaps();
        if (cancelled || !node.current) return;
        api.current = ymaps;
        map.current = new ymaps.Map(node.current, { center: [56.3269, 44.0059], zoom: 11, controls: ["zoomControl"] });
        map.current.events.add("click", (event: any) => { const [lat, lng] = event.get("coords"); void select(lat, lng); });
        setReady(true); setBusy(false);
        const token = revision.current;
        const text = [latest.current.city, latest.current.address].filter(Boolean).join(", ");
        if (text) {
          try { const found = await geocode(text); if (!cancelled && token === revision.current) { map.current.setCenter([found.lat, found.lng], latest.current.address ? 16 : 11); } } catch { /* Manual map selection remains available. */ }
        }
      } catch (e) { if (!cancelled) { setBusy(false); setError((e as Error).message); } }
    })();
    return () => { cancelled = true; revision.current++; map.current?.destroy(); map.current = null; marker.current = null; };
  }, [open]);

  async function findAddress() {
    const token = ++revision.current; setBusy(true); setError(""); setCandidate(null);
    try {
      const found = await geocode(query.trim());
      if (token !== revision.current) return;
      place(found.lat, found.lng); map.current?.setCenter([found.lat, found.lng], 16);
      setCandidate({ ...found, city: found.city || cityFromAddress(found.address) });
    } catch (e) { if (token === revision.current) setError((e as Error).message); }
    finally { if (token === revision.current) setBusy(false); }
  }

  function locate() {
    if (!navigator.geolocation) { setError("Геопозиция недоступна. Выберите место на карте."); return; }
    const token = ++revision.current; setBusy(true); setError(""); setCandidate(null);
    navigator.geolocation.getCurrentPosition(position => {
      if (token !== revision.current) return;
      const { latitude, longitude } = position.coords;
      map.current?.setCenter([latitude, longitude], 16); void select(latitude, longitude);
    }, () => { if (token === revision.current) { setBusy(false); setError("Нет доступа к геопозиции. Нажмите на нужное место на карте."); } }, { timeout: 10000 });
  }

  function edit(callback: (value: string) => void, value: string) { revision.current++; setBusy(false); setCandidate(null); callback(value); props.onLocation(null); marker.current && map.current?.geoObjects.remove(marker.current); marker.current = null; }
  return <section className="min-w-0 space-y-3 md:col-span-2">
    <div className="grid gap-4 md:grid-cols-2">
      <label className="min-w-0"><span className="mb-2 block text-sm font-bold">Город или населённый пункт</span><input className="input w-full" value={props.city} maxLength={120} placeholder="Нижний Новгород" onChange={e => edit(props.onCity, e.target.value)} /></label>
      <label className="min-w-0"><span className="mb-2 block text-sm font-bold">Адрес объекта или базы</span><input className="input w-full" value={props.address} maxLength={400} placeholder="Улица и дом, без квартиры" onChange={e => edit(props.onAddress, e.target.value)} /></label>
    </div>
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-12 items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-100"><MapIcon size={19} />{open ? "Скрыть карту" : "Выбрать место на карте"}</button>
    {open ? <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <input aria-label="Найти адрес на карте" maxLength={400} className="input min-w-0 flex-1" placeholder="Город, улица и дом" value={query} onChange={e => { revision.current++; setBusy(false); setCandidate(null); setQuery(e.target.value); }} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (ready && !busy && query.trim().length >= 3) void findAddress(); } }} />
        <button type="button" disabled={!ready || busy || query.trim().length < 3} onClick={() => void findAddress()} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Найти</button>
        <button type="button" disabled={!ready || busy} onClick={locate} className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold disabled:opacity-50"><LocateFixed size={17} />Я здесь</button>
      </div>
      <div ref={node} className="h-80 w-full" aria-label="Карта выбора адреса" />
      <p aria-live="polite" className="flex items-start gap-2 p-3 text-sm text-slate-600"><MapPin size={18} className="shrink-0" />{busy ? "Определяем местоположение…" : "Нажмите на карту или переместите метку — подтвердите найденный адрес."}</p>
      {candidate && !busy ? <div className="location-confirm m-3 rounded-2xl bg-blue-50 p-4 shadow-sm" style={{ animation: "locationReveal .22s ease-out" }}><p className="text-xs font-bold text-blue-600">Это нужное место?</p><p className="my-2 font-semibold">{candidate.address}</p><button type="button" className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white" onClick={() => { props.onCity(candidate.city); props.onAddress(candidate.address); props.onLocation(candidate); setOpen(false); }}>Использовать этот адрес</button></div> : null}
      <style>{`@keyframes locationReveal { from {opacity:0;transform:translateY(6px)} to {opacity:1;transform:translateY(0)} } @media(prefers-reduced-motion:reduce){.location-confirm{animation:none!important}}`}</style>
      {error ? <p role="alert" className="px-3 pb-3 text-sm text-red-600">{error} {!ready ? "Закройте и откройте карту для повторной загрузки." : ""}</p> : null}
    </div> : null}
    <p className="text-xs leading-relaxed text-slate-500">Укажите место работы или объекта. Точный адрес помогает находить заказы и исполнителей рядом.</p>
  </section>;
}
