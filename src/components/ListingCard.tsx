"use client";

import FavoriteButton from "@/components/FavoriteButton";
import ListingAuthorVerifiedBadge from "@/components/ListingAuthorVerifiedBadge";
import type { Listing } from "@/types";
import { isCreatedWithinHours } from "@/types";
import {
  Banknote,
  CreditCard,
  MapPin,
  Star,
  UserRound,
} from "lucide-react";
import Link from "next/link";

type ListingCardProps = {
  listing: Listing;
};

function getImageUrl(listing: Listing) {
  return (
    listing.imageUrls?.[0] ||
    listing.media?.find((item) => item.type === "image")?.url ||
    ""
  );
}

function paymentText(listing: Listing) {
  const methods = listing.paymentMethods || [];

  if (methods.includes("cash") && methods.includes("transfer")) {
    return "Наличные / перевод";
  }

  if (methods.includes("transfer")) return "Переводом";
  return "Наличными";
}

function paymentIcon(listing: Listing) {
  if ((listing.paymentMethods || []).includes("transfer")) {
    return <CreditCard size={14} />;
  }

  return <Banknote size={14} />;
}

function ListingCard({ listing }: ListingCardProps) {
  const imageUrl = getImageUrl(listing);
  const isNew = isCreatedWithinHours(listing.createdAt, 72);

  return (
    <article className="group relative overflow-hidden rounded-[26px] bg-white shadow-sm ring-1 ring-gray-100 transition duration-300 hover:-translate-y-1 hover:shadow-xl">
      <FavoriteButton
        listingId={listing.id}
        title={listing.title}
        city={listing.city}
        priceFrom={listing.priceFrom}
        imageUrl={imageUrl}
        compact
        className="absolute right-3 top-3 z-20 shadow-lg"
      />

      <Link href={`/listing/${listing.id}`} className="block">
        <div className="relative h-44 overflow-hidden bg-blue-50">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={listing.title}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl font-black text-blue-200">
              Стройка
            </div>
          )}

          <div className="absolute left-3 top-3 max-w-[70%] truncate rounded-full bg-white/95 px-3 py-1 text-xs font-black text-[#0057ff] shadow-sm">
            {listing.category || "Строительные услуги"}
          </div>
        </div>

        <div className="p-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-black">
            <span className="rounded-full bg-green-50 px-2.5 py-1 text-green-700">
              {listing.accountType === "ip"
                ? "ИП"
                : listing.accountType === "ooo"
                ? "ООО"
                : "Физлицо"}
            </span>

            <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[#0057ff]">
              {paymentIcon(listing)}
              {paymentText(listing)}
            </span>
          </div>

          <h3 className="mt-3 line-clamp-2 text-xl font-black leading-tight text-gray-950">
            {listing.title}
          </h3>

          <p className="mt-2 line-clamp-2 text-sm leading-5 text-gray-500">
            {listing.description}
          </p>

          <p className="mt-3 flex items-center gap-2 text-sm font-bold text-gray-500">
            <MapPin size={15} className="shrink-0 text-[#0057ff]" />
            <span className="truncate">{listing.city || "Город не указан"}</span>
          </p>

          <div className="mt-4 flex items-end justify-between gap-3 border-t border-gray-100 pt-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-gray-400">Исполнитель</p>

              <div className="mt-1.5 flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-[#0057ff]">
                  {listing.authorAvatarUrl ? (
                    <img
                      src={listing.authorAvatarUrl}
                      alt={listing.authorName || "Исполнитель"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <UserRound size={16} />
                  )}
                </div>

                <p className="truncate text-sm font-black text-gray-950">
                  {listing.authorName || "Исполнитель"}
                </p>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <ListingAuthorVerifiedBadge listing={listing} />
                {isNew ? (
                  <span className="flex items-center gap-1 text-xs font-black text-amber-500">
                    <Star size={13} className="fill-amber-400" />
                    Новая анкета
                  </span>
                ) : null}
              </div>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-[11px] font-bold text-gray-400">Цена от</p>
              <p className="mt-1 text-xl font-black text-[#0057ff]">
                {listing.priceFrom
                  ? `${listing.priceFrom.toLocaleString("ru-RU")} ₽`
                  : "Договорная"}
              </p>
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
}

export { ListingCard };
export default ListingCard;
