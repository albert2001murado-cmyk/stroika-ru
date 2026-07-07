"use client";

import FavoriteButton from "@/components/FavoriteButton";
import type { Listing } from "@/types";
import {
  Banknote,
  CreditCard,
  MapPin,
  Star,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import ListingAuthorVerifiedBadge from "@/components/ListingAuthorVerifiedBadge";
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

  if (methods.includes("transfer")) {
    return "Переводом";
  }

  return "Наличными";
}

function paymentIcon(listing: Listing) {
  const methods = listing.paymentMethods || [];

  if (methods.includes("transfer")) {
    return <CreditCard size={15} />;
  }

  return <Banknote size={15} />;
}

function ListingCard({ listing }: ListingCardProps) {
  const imageUrl = getImageUrl(listing);

  return (
    <article className="relative overflow-hidden rounded-[30px] bg-white shadow-sm ring-1 ring-gray-100 transition hover:-translate-y-1 hover:shadow-xl">
      <FavoriteButton
        listingId={listing.id}
        title={listing.title}
        city={listing.city}
        priceFrom={listing.priceFrom}
        imageUrl={imageUrl}
        compact
        className="absolute right-4 top-4 z-20 shadow-lg"
      />

      <Link href={`/listing/${listing.id}`} className="block">
        <div className="relative h-56 overflow-hidden bg-blue-50">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={listing.title}
              className="h-full w-full object-cover transition duration-300 hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-4xl font-black text-blue-200">
              Стройка
            </div>
          )}

          <div className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1 text-xs font-black text-[#0057ff] shadow-sm">
            {listing.category}
          </div>
        </div>

        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2 text-xs font-black">
            <span className="rounded-full bg-green-50 px-3 py-1 text-green-700">
              {listing.accountType === "ip"
                ? "ИП"
                : listing.accountType === "ooo"
                ? "ООО"
                : "Физлицо"}
            </span>

            <span className="flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-[#0057ff]">
              {paymentIcon(listing)}
              {paymentText(listing)}
            </span>
          </div>

          <h3 className="mt-4 line-clamp-2 text-2xl font-black text-gray-950">
            {listing.title}
          </h3>

          <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-500">
            {listing.description}
          </p>

          <p className="mt-4 flex items-center gap-2 text-sm font-bold text-gray-500">
            <MapPin size={16} className="text-[#0057ff]" />
            {listing.city}
          </p>

          <div className="mt-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-gray-400">Исполнитель</p>

              <div className="mt-2 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-[#0057ff]">
                  {listing.authorAvatarUrl ? (
                    <img
                      src={listing.authorAvatarUrl}
                      alt={listing.authorName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <UserRound size={17} />
                  )}
                </div>

                <p className="font-black text-gray-950">
                  {listing.authorName}
                </p>
              </div>

              <p className="mt-2 flex items-center gap-1 text-xs font-bold text-yellow-500">
                <ListingAuthorVerifiedBadge listing={listing} />
                <Star size={14} className="fill-yellow-400" />
                Новая анкета
              </p>
            </div>

            <div className="text-right">
              <p className="text-xs font-bold text-gray-400">Цена от</p>

              <p className="mt-1 text-2xl font-black text-[#0057ff]">
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
