"use client";

import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  GitCompareArrows,
  MessageCircle,
  PlusCircle,
} from "lucide-react";
import Link from "next/link";

const items = [
  {
    href: "/portfolio",
    title: "Портфолио",
    text: "Добавляйте выполненные работы",
    Icon: BriefcaseBusiness,
  },
  {
    href: "/availability",
    title: "Календарь",
    text: "Отмечайте свободные и занятые дни",
    Icon: CalendarDays,
  },
  {
    href: "/analytics",
    title: "Статистика",
    text: "Просмотры, звонки и переходы в чат",
    Icon: BarChart3,
  },
  {
    href: "/compare",
    title: "Сравнение",
    text: "Сравнивайте до трёх исполнителей",
    Icon: GitCompareArrows,
  },
  {
    href: "/requests",
    title: "Заявки",
    text: "Заказы клиентов и отклики",
    Icon: PlusCircle,
  },
  {
    href: "/messages",
    title: "Сообщения",
    text: "Все переписки в одном месте",
    Icon: MessageCircle,
  },
];

export default function ProfileTools() {
  return (
    <section className="rounded-[30px] bg-white p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="text-2xl font-black text-gray-950 sm:text-3xl">
          Инструменты
        </h2>
        <p className="mt-2 text-sm font-medium text-gray-500">
          Эти разделы используют те же данные, что и мобильное приложение.
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(({ href, title, text, Icon }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-[24px] border border-gray-100 bg-[#f8fafc] p-4 transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/60"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#0057ff] shadow-sm">
              <Icon size={21} strokeWidth={2.7} />
            </span>
            <h3 className="mt-4 font-black text-gray-950">{title}</h3>
            <p className="mt-1 text-sm font-medium leading-5 text-gray-500">
              {text}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
