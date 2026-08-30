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
        {items.map(({ href, title, text, Icon }, index) => (
          <Link
            key={href}
            href={href}
            className="profile-tool-card group relative overflow-hidden rounded-[24px] border border-gray-100 bg-[#f8fafc] p-4"
            style={{ animationDelay: `${Math.min(index * 55, 275)}ms` }}
          >
            <span className="profile-tool-icon flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#0057ff] shadow-sm">
              <Icon size={21} strokeWidth={2.7} />
            </span>
            <h3 className="mt-4 font-black text-gray-950">{title}</h3>
            <p className="mt-1 text-sm font-medium leading-5 text-gray-500">
              {text}
            </p>
          </Link>
        ))}
      </div>

      <style>{`
        @keyframes profile-tool-in {
          from { opacity: 0; transform: translateY(12px) scale(.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .profile-tool-card {
          animation: profile-tool-in .48s cubic-bezier(.22,1,.36,1) both;
          transition: transform .32s ease, border-color .32s ease, background-color .32s ease, box-shadow .32s ease;
        }
        .profile-tool-card::after {
          content: "";
          position: absolute;
          width: 110px;
          height: 110px;
          right: -72px;
          bottom: -78px;
          border-radius: 999px;
          background: rgba(0,87,255,.11);
          transition: transform .4s ease;
        }
        .profile-tool-card:hover {
          transform: translateY(-5px);
          border-color: #bfdbfe;
          background: #fff;
          box-shadow: 0 18px 40px rgba(0,87,255,.12);
        }
        .profile-tool-card:hover::after { transform: scale(1.55); }
        .profile-tool-icon { transition: transform .35s cubic-bezier(.2,.8,.2,1), background-color .35s ease; }
        .profile-tool-card:hover .profile-tool-icon { transform: rotate(-5deg) scale(1.1); background: #edf4ff; }
        .profile-tool-card:active { transform: scale(.975); }
        @media (prefers-reduced-motion: reduce) {
          .profile-tool-card { animation: none !important; transition: none !important; }
          .profile-tool-icon { transition: none !important; }
        }
      `}</style>
    </section>
  );
}
