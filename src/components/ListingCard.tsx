"use client";

import { db } from "@/lib/firebase";
import type { Listing, UserProfile } from "@/types";
import { doc, getDoc } from "firebase/firestore";
import {
  Banknote,
  CreditCard,
  MapPin,
  ShieldCheck,
  Star,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

function accountLabel(type: Listing["accountType"]) {
  if (type === "ip") return "ИП";
  if (type === "ooo") return "ООО";
  return "Физлицо";
}

function paymentLabel(listing: Listing) {
  const methods = listing.paymentMethods || [];

  if (methods.includes("cash") && methods.includes("transfer")) {
    return "Наличные / перевод";
  }

  if (methods.includes("transfer")) {
    return "Переводом";
  }

  return "Наличными";
}

export function ListingCard({ listing }: { listing: Listing }) {
  const coverImage = listing.imageUrls?.[0];
  const [authorAvatar, setAuthorAvatar] = useState(
    listing.authorAvatarUrl || ""
  );

  useEffect(() => {
    async function loadAuthorAvatar() {
      if (authorAvatar || !listing.authorId) return;

      const snap = await getDoc(doc(db, "users", listing.authorId));

      if (snap.exists()) {
        const profile = snap.data() as UserProfile;
        setAuthorAvatar(profile.avatarUrl || "");
      }
    }

    loadAuthorAvatar();
  }, [authorAvatar, listing.authorId]);

  return (
    <Link
      href={`/listing/${listing.id}`}
      className="group block overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-2xl hover:shadow-blue-900/10"
    >
      <div className="relative h-64 bg-blue-50">
        {coverImage ? (
          <img
            src={coverImage}
            alt={listing.title}
            className="h-full w-full object-contain transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl font-black text-blue-200">
            Стройка
          </div>
        )}

        <div className="absolute left-3 top-3 rounded-2xl bg-white/95 px-3 py-2 text-xs font-black text-[#0057ff] shadow-sm">
          {listing.category}
        </div>

        <div className="absolute bottom-[-26px] left-5 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-blue-50 text-[#0057ff] shadow-lg">
          {authorAvatar ? (
            <img
              src={authorAvatar}
              alt={listing.authorName}
              className="h-full w-full object-cover"
            />
          ) : (
            <UserRound size={28} />
          )}
        </div>
      </div>

      <div className="p-5 pt-9">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-1 rounded-2xl bg-yellow-100 px-3 py-2 text-xs font-black text-yellow-800">
            <ShieldCheck size={14} />
            {accountLabel(listing.accountType)}
          </div>

          <div className="flex items-center gap-1 rounded-2xl bg-blue-50 px-3 py-2 text-xs font-black text-[#0057ff]">
            {listing.paymentMethods?.includes("transfer") ? (
              <CreditCard size={14} />
            ) : (
              <Banknote size={14} />
            )}
            {paymentLabel(listing)}
          </div>
        </div>

        <h3 className="text-xl font-black leading-tight text-gray-950 transition group-hover:text-[#0057ff]">
          {listing.title}
        </h3>

        <p className="mt-2 text-sm font-bold text-gray-500">
          {listing.subcategory}
        </p>

        <p className="mt-4 line-clamp-3 text-sm leading-6 text-gray-600">
          {listing.description}
        </p>

        <div className="mt-5 flex items-center gap-2 text-sm font-bold text-gray-500">
          <MapPin size={17} className="text-[#0057ff]" />
          {listing.city}
        </div>

        <div className="mt-5 border-t border-gray-100 pt-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm text-gray-500">Исполнитель</p>
              <p className="font-black text-gray-950">{listing.authorName}</p>
            </div>

            <div className="text-right">
              <p className="text-sm text-gray-500">Цена от</p>
              <p className="text-xl font-black text-[#0057ff]">
                {listing.priceFrom
                  ? `${listing.priceFrom.toLocaleString("ru-RU")} ₽`
                  : "договорная"}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-1 text-sm font-bold text-gray-500">
            <Star size={16} className="fill-[#ffd233] text-[#ffd233]" />
            Новая анкета
          </div>
        </div>
      </div>
    </Link>
  );
}
