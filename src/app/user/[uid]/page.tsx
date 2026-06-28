"use client";

import { db } from "@/lib/firebase";
import type { Listing, UserProfile } from "@/types";
import {
  BriefcaseBusiness,
  Building2,
  Mail,
  MapPin,
  Phone,
  UserRound,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

function accountText(profile?: UserProfile | null) {
  if (!profile) return "Пользователь";

  if (profile.accountType === "ip") return "ИП";
  if (profile.accountType === "ooo") return "ООО";

  return "Физлицо";
}

export default function PublicUserPage() {
  const params = useParams();
  const uid = String(params.uid);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      const snap = await getDoc(doc(db, "users", uid));

      if (snap.exists()) {
        setProfile({
          uid: snap.id,
          ...snap.data(),
        } as UserProfile);
      }

      setLoading(false);
    }

    loadProfile();
  }, [uid]);

  useEffect(() => {
    const q = query(collection(db, "listings"), where("authorId", "==", uid));

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
  }, [uid]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-5 py-10">
        <div className="mx-auto max-w-6xl">Загрузка...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-5 py-8">
      <div className="mx-auto max-w-6xl">
        <section className="overflow-hidden rounded-[34px] bg-white shadow-sm">
          <div className="h-32 bg-[#0057ff]" />

          <div className="-mt-16 px-6 pb-8 sm:px-8">
            <div className="flex flex-wrap items-end gap-5">
              <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-[#0057ff] ring-8 ring-white">
                {profile?.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt={profile.displayName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <UserRound size={54} />
                )}
              </div>

              <div className="pb-2">
                <h1 className="text-4xl font-black text-gray-950">
                  {profile?.displayName || "Пользователь"}
                </h1>

                <p className="mt-2 flex items-center gap-2 font-bold text-gray-500">
                  <BriefcaseBusiness size={18} />
                  {accountText(profile)}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {profile?.companyName && (
                <div className="rounded-2xl bg-[#f5f7fb] p-4">
                  <p className="flex items-center gap-2 font-black text-gray-950">
                    <Building2 size={18} className="text-[#0057ff]" />
                    {profile.companyName}
                  </p>
                </div>
              )}

              {profile?.city && (
                <div className="rounded-2xl bg-[#f5f7fb] p-4">
                  <p className="flex items-center gap-2 font-black text-gray-950">
                    <MapPin size={18} className="text-[#0057ff]" />
                    {profile.city}
                  </p>
                </div>
              )}

              {profile?.phone && (
                <div className="rounded-2xl bg-[#f5f7fb] p-4">
                  <p className="flex items-center gap-2 font-black text-gray-950">
                    <Phone size={18} className="text-[#0057ff]" />
                    {profile.phone}
                  </p>
                </div>
              )}

              {profile?.email && (
                <div className="rounded-2xl bg-[#f5f7fb] p-4">
                  <p className="flex items-center gap-2 truncate font-black text-gray-950">
                    <Mail size={18} className="shrink-0 text-[#0057ff]" />
                    {profile.email}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-3xl font-black text-gray-950">
            Объявления пользователя
          </h2>

          <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {listings.length === 0 ? (
              <div className="rounded-[30px] bg-white p-8 text-gray-500 shadow-sm md:col-span-2 lg:col-span-3">
                У пользователя пока нет объявлений.
              </div>
            ) : (
              listings.map((listing) => (
                <Link
                  key={listing.id}
                  href={`/listing/${listing.id}`}
                  className="overflow-hidden rounded-[30px] bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="h-52 bg-blue-50">
                    {listing.imageUrls?.[0] ? (
                      <img
                        src={listing.imageUrls[0]}
                        alt={listing.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-3xl font-black text-blue-200">
                        Стройка.ру
                      </div>
                    )}
                  </div>

                  <div className="p-5">
                    <p className="font-black text-[#0057ff]">
                      {listing.category}
                    </p>

                    <h3 className="mt-2 line-clamp-2 text-xl font-black text-gray-950">
                      {listing.title}
                    </h3>

                    <p className="mt-3 flex items-center gap-2 text-sm font-bold text-gray-500">
                      <MapPin size={16} />
                      {listing.city}
                    </p>

                    <p className="mt-4 text-2xl font-black text-gray-950">
                      {listing.priceFrom
                        ? `от ${listing.priceFrom.toLocaleString("ru-RU")} ₽`
                        : "Договорная"}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
