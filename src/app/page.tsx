"use client";

import  ListingCard  from "@/components/ListingCard";
import { categories } from "@/data/categories";
import { db } from "@/lib/firebase";
import type { Listing } from "@/types";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import {
  Building2,
  Hammer,
  HardHat,
  Ruler,
  Search,
  SlidersHorizontal,
  Truck,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const categoryIcons = [Hammer, Building2, Wrench, Truck, Ruler];

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function HomePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");

  useEffect(() => {
    const q = query(collection(db, "listings"), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Listing[];

      setListings(data);
    });

    return () => unsub();
  }, []);

  const selectedCategory = categories.find((item) => item.name === category);

  const filteredListings = useMemo(() => {
    const words = normalizeSearch(search).split(" ").filter(Boolean);

    return listings.filter((listing) => {
      const text = normalizeSearch(
        [
          listing.title,
          listing.description,
          listing.authorName,
          listing.category,
          listing.subcategory,
          listing.city,
          listing.phone,
        ]
          .filter(Boolean)
          .join(" ")
      );

      const matchesSearch = words.length
        ? words.every((word) => text.includes(word))
        : true;

      const matchesCategory = category ? listing.category === category : true;
      const matchesSubcategory = subcategory
        ? listing.subcategory === subcategory
        : true;

      return matchesSearch && matchesCategory && matchesSubcategory;
    });
  }, [listings, search, category, subcategory]);

  return (
    <main className="min-h-screen bg-[#f5f7fb]">
      <section className="bg-[#0057ff] px-5 pb-16 pt-12 text-white">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-black text-[#ffd233] backdrop-blur">
                <Hammer size={18} />
                Сервис строительных услуг
              </div>

              <h1 className="mt-6 max-w-3xl text-5xl font-black leading-[1.05] tracking-tight md:text-7xl">
                Найдите мастера, бригаду или компанию
              </h1>

              <p className="mt-6 max-w-2xl text-lg font-medium leading-8 text-blue-50">
                Стройка.ру — удобный сервис объявлений для ремонта, отделки,
                строительства домов, спецтехники и проектирования.
              </p>
            </div>

            <div className="hidden rounded-[34px] bg-white/12 p-5 backdrop-blur lg:block">
              <div className="rounded-[28px] bg-white p-6 text-gray-950 shadow-2xl">
                <p className="text-sm font-black text-[#0057ff]">
                  Быстрый подбор
                </p>

                <h3 className="mt-2 text-3xl font-black">
                  1 заявка — несколько исполнителей
                </h3>

                <div className="mt-6 space-y-3">
                  {[
                    "Проверяйте анкеты и отзывы",
                    "Выбирайте физлицо, ИП или ООО",
                    "Сравнивайте цены и города",
                  ].map((item) => (
                    <div
                      key={item}
                      className="rounded-2xl bg-[#f5f7fb] px-4 py-3 font-bold"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="soft-shadow mt-10 rounded-[28px] bg-white p-4 text-gray-950">
            <div className="grid gap-3 md:grid-cols-[1fr_160px]">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-7 top-1/2 -translate-y-1/2 text-gray-400"
                  size={22}
                />

                <input
                  className="input h-16 pr-5 text-base font-bold"
                  style={{ paddingLeft: "85px" }}
                  placeholder="Что нужно сделать? Например: каркасные дома"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <button type="button" className="btn-yellow h-16 text-base">
                Найти
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className="-mt-16 rounded-[28px] border border-gray-200 bg-white p-5 shadow-xl shadow-blue-900/10">
          <div className="mb-4 flex items-center gap-2">
            <SlidersHorizontal size={22} className="text-[#0057ff]" />
            <h2 className="text-xl font-black text-gray-950">Фильтры</h2>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <select
              className="input bg-white font-bold text-gray-950"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
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

            <select
              className="input bg-white font-bold text-gray-950 disabled:text-gray-500"
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              disabled={!category}
            >
              <option value="">Все подкатегории</option>
              {selectedCategory?.subcategories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="rounded-2xl bg-gray-100 px-4 py-3 font-black text-gray-700 transition hover:bg-gray-200"
              onClick={() => {
                setSearch("");
                setCategory("");
                setSubcategory("");
              }}
            >
              Сбросить фильтры
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-5">
          {categories.map((item, index) => {
            const Icon = categoryIcons[index] || Hammer;
            const active = category === item.name;

            return (
              <button
                key={item.name}
                type="button"
                onClick={() => {
                  setCategory(active ? "" : item.name);
                  setSubcategory("");
                }}
                className={`rounded-3xl border p-5 text-left transition hover:-translate-y-1 hover:shadow-xl ${
                  active
                    ? "border-[#0057ff] bg-[#0057ff] text-white"
                    : "border-gray-200 bg-white text-gray-950"
                }`}
              >
                <div
                  className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${
                    active
                      ? "bg-white/15 text-[#ffd233]"
                      : "bg-blue-50 text-[#0057ff]"
                  }`}
                >
                  <Icon size={25} />
                </div>

                <p className="font-black">{item.name}</p>

                <p
                  className={`mt-1 text-sm ${
                    active ? "text-blue-50" : "text-gray-500"
                  }`}
                >
                  {item.subcategories.length} подкатегорий
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-4xl font-black text-gray-950">
              Рекомендованные анкеты
            </h2>
            <p className="mt-2 font-medium text-gray-500">
              Найдено объявлений: {filteredListings.length}
            </p>
          </div>
        </div>

        {filteredListings.length === 0 ? (
          <div className="mt-8 rounded-[30px] border border-dashed border-blue-200 bg-white p-12 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-50 text-[#0057ff]">
              <Search size={30} />
            </div>

            <h3 className="mt-5 text-3xl font-black text-gray-950">
              Ничего не найдено
            </h3>

            <p className="mx-auto mt-3 max-w-xl text-gray-500">
              Попробуй другой запрос или сбрось фильтры.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
