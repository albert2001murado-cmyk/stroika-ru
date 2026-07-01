"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import type { Timestamp } from "firebase/firestore";
import { collection, deleteDoc, doc, onSnapshot } from "firebase/firestore";
import { Heart, MapPin, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type FavoriteItem = {
  id: string;
  listingId: string;
  title: string;
  city?: string;
  priceFrom?: number | null;
  imageUrl?: string;
  createdAt?: Timestamp;
};

function getFavoriteTime(item: FavoriteItem) {
  return item.createdAt?.toMillis?.() || 0;
}

export default function FavoritesPage() {
  const { user, loading } = useAuth();

  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user) {
      setFavorites([]);
      return;
    }

    const favoritesRef = collection(db, "users", user.uid, "favorites");

    const unsub = onSnapshot(favoritesRef, (snapshot) => {
      const data = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data(),
      })) as FavoriteItem[];

      data.sort((a, b) => getFavoriteTime(b) - getFavoriteTime(a));

      setFavorites(data);
    });

    return () => unsub();
  }, [user]);

  const filteredFavorites = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) return favorites;

    return favorites.filter((item) => {
      return (
        item.title?.toLowerCase().includes(value) ||
        item.city?.toLowerCase().includes(value)
      );
    });
  }, [favorites, search]);

  async function removeFavorite(listingId: string) {
    if (!user) return;

    await deleteDoc(doc(db, "users", user.uid, "favorites", listingId));
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-5 py-10">
        <div className="mx-auto max-w-6xl">Загрузка...</div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-5 py-10">
        <div className="mx-auto max-w-xl rounded-[30px] bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-red-50 text-red-500">
            <Heart className="fill-red-500" size={30} />
          </div>

          <h1 className="mt-5 text-3xl font-black text-gray-950">
            Войдите, чтобы сохранять объявления
          </h1>

          <p className="mt-3 text-gray-500">
            Избранное будет храниться в аккаунте и открываться с любого устройства.
          </p>

          <Link href="/auth" className="btn-primary mt-6 inline-flex">
            Войти
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-5 py-8">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-[34px] bg-[#0057ff] p-8 text-white">
          <p className="font-black text-[#ffd233]">Стройка.ру</p>

          <h1 className="mt-3 text-4xl font-black">Избранные анкеты</h1>

          <p className="mt-3 max-w-2xl text-blue-50">
            Здесь хранятся все услуги и исполнители, которые вы сохранили.
          </p>
        </section>

        <section className="mt-6 rounded-[30px] bg-white p-5 shadow-sm">
          <div className="relative">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400"
              size={21}
            />

            <input
              className="input"
              style={{ paddingLeft: "60px" }}
              placeholder="Поиск в избранном"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </section>

        <section className="mt-6">
          {filteredFavorites.length === 0 ? (
            <div className="rounded-[30px] bg-white p-10 text-center shadow-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-red-50 text-red-500">
                <Heart className="fill-red-500" size={30} />
              </div>

              <h2 className="mt-5 text-2xl font-black text-gray-950">
                Пока ничего не сохранено
              </h2>

              <p className="mt-2 text-gray-500">
                Нажимайте сердечко на карточках объявлений, и они появятся здесь.
              </p>

              <Link href="/" className="btn-primary mt-6 inline-flex">
                Смотреть объявления
              </Link>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {filteredFavorites.map((item) => (
                <article
                  key={item.id}
                  className="group overflow-hidden rounded-[30px] bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                >
                  <Link href={`/listing/${item.listingId}`} className="block">
                    <div className="relative h-52 bg-blue-50">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-3xl font-black text-blue-200">
                          Стройка.ру
                        </div>
                      )}

                      <div className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white text-red-500 shadow-lg">
                        <Heart className="fill-red-500" size={20} />
                      </div>
                    </div>

                    <div className="p-5">
                      <h2 className="line-clamp-2 text-xl font-black text-gray-950 group-hover:text-[#0057ff]">
                        {item.title}
                      </h2>

                      {item.city && (
                        <p className="mt-3 flex items-center gap-2 text-sm font-bold text-gray-500">
                          <MapPin size={16} />
                          {item.city}
                        </p>
                      )}

                      <p className="mt-5 text-2xl font-black text-gray-950">
                        {item.priceFrom
                          ? `от ${item.priceFrom.toLocaleString("ru-RU")} ₽`
                          : "Договорная"}
                      </p>
                    </div>
                  </Link>

                  <div className="px-5 pb-5">
                    <button
                      type="button"
                      onClick={() => removeFavorite(item.listingId)}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 px-4 py-3 font-black text-red-600 transition hover:bg-red-100"
                    >
                      <Trash2 size={18} />
                      Убрать из избранного
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
