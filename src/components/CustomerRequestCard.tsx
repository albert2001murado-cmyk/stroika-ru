"use client";

import type { CustomerRequest } from "@/types";
import { isCreatedWithinHours } from "@/types";
import {
  CalendarDays,
  CircleDollarSign,
  Clock3,
  MapPin,
  UserRound,
} from "lucide-react";
import Link from "next/link";

type CustomerRequestCardProps = {
  request: CustomerRequest;
};

function formatBudget(request: CustomerRequest) {
  const from = request.budgetFrom ?? request.budget ?? null;
  const to = request.budgetTo ?? null;

  if (from && to) {
    return `${from.toLocaleString("ru-RU")}–${to.toLocaleString("ru-RU")} ₽`;
  }

  if (from) return `от ${from.toLocaleString("ru-RU")} ₽`;
  if (to) return `до ${to.toLocaleString("ru-RU")} ₽`;
  return "Бюджет договорной";
}

export default function CustomerRequestCard({ request }: CustomerRequestCardProps) {
  const imageUrl = request.imageUrls?.[0] || "";
  const isNew = isCreatedWithinHours(request.createdAt, 72);

  return (
    <article className="group relative overflow-hidden rounded-[26px] bg-white shadow-sm ring-1 ring-gray-100 transition duration-300 hover:-translate-y-1 hover:shadow-xl">
      <Link href={`/requests/${request.id}`} className="block">
        <div className="relative h-44 overflow-hidden bg-gradient-to-br from-blue-50 to-slate-100">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={request.title}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-[#0057ff] shadow-lg">
                <UserRound size={30} />
              </div>
            </div>
          )}

          <div className="absolute left-3 top-3 flex max-w-[75%] items-center gap-2 rounded-full bg-white/95 px-3 py-1 text-xs font-black text-[#0057ff] shadow-sm backdrop-blur">
            {request.category || "Заявка заказчика"}
          </div>

          {request.urgency === "urgent" ? (
            <span className="absolute bottom-3 left-3 rounded-full bg-orange-500 px-3 py-1 text-xs font-black text-white shadow-lg">
              Срочно
            </span>
          ) : null}
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[#0057ff]">
                Заказчик ищет исполнителя
              </p>
              <h3 className="mt-2 line-clamp-2 text-xl font-black leading-tight text-gray-950">
                {request.title}
              </h3>
            </div>

            <span className="shrink-0 rounded-2xl bg-blue-50 px-3 py-2 text-right text-sm font-black text-[#0057ff]">
              {formatBudget(request)}
            </span>
          </div>

          <p className="mt-3 line-clamp-2 text-sm leading-6 text-gray-500">
            {request.description}
          </p>

          <div className="mt-4 grid gap-2 text-sm font-bold text-gray-500 sm:grid-cols-2">
            <p className="flex min-w-0 items-center gap-2">
              <MapPin size={16} className="shrink-0 text-[#0057ff]" />
              <span className="truncate">{request.city || "Город не указан"}</span>
            </p>

            {request.deadline ? (
              <p className="flex items-center gap-2">
                <CalendarDays size={16} className="shrink-0 text-[#0057ff]" />
                <span className="truncate">{request.deadline}</span>
              </p>
            ) : (
              <p className="flex items-center gap-2">
                <CircleDollarSign size={16} className="shrink-0 text-[#0057ff]" />
                <span>Открыта для предложений</span>
              </p>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-[#0057ff]">
                {request.customerAvatar ? (
                  <img
                    src={request.customerAvatar}
                    alt={request.customerName || "Заказчик"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <UserRound size={18} />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-gray-950">
                  {request.customerName || "Заказчик"}
                </p>
                <p className="text-xs font-bold text-gray-400">Заявка заказчика</p>
              </div>
            </div>

            {isNew ? (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-600">
                <Clock3 size={13} />
                Новая заявка
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </article>
  );
}
