"use client";

import { BadgeCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";
import VerifiedBadge from "./VerifiedBadge";

type VerifiedProfileCardProps = {
  verified?: boolean;
  isOwnProfile?: boolean;
};

export default function VerifiedProfileCard({
  verified,
  isOwnProfile = false,
}: VerifiedProfileCardProps) {
  if (verified) {
    return (
      <div className="rounded-[28px] bg-blue-50 p-5 ring-1 ring-blue-100">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0057ff] text-white shadow-lg shadow-blue-500/20">
            <ShieldCheck size={26} strokeWidth={2.8} />
          </div>

          <div>
            <VerifiedBadge size="lg" />
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
              Этот профиль прошёл проверку модератором Стройка.ру. Клиенты будут
              видеть галочку в профиле и объявлениях.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!isOwnProfile) {
    return null;
  }

  return (
    <div className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-blue-100">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
          <BadgeCheck size={26} strokeWidth={2.8} />
        </div>

        <div>
          <p className="text-lg font-black text-slate-950">
            Получить галочку
          </p>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            Отправь заявку на проверку, чтобы профиль стал проверенным
            исполнителем.
          </p>

          <Link
            href="/verification"
            className="mt-4 inline-flex rounded-2xl bg-[#0057ff] px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-500/20"
          >
            Отправить заявку
          </Link>
        </div>
      </div>
    </div>
  );
}
