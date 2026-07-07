"use client";

import { BadgeCheck } from "lucide-react";

type VerifiedBadgeProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

export default function VerifiedBadge({
  size = "md",
  className = "",
}: VerifiedBadgeProps) {
  const classes =
    size === "sm"
      ? "gap-1 rounded-full px-2.5 py-1 text-[11px]"
      : size === "lg"
      ? "gap-2 rounded-2xl px-4 py-2.5 text-sm"
      : "gap-1.5 rounded-full px-3 py-1.5 text-xs";

  const iconSize = size === "lg" ? 19 : size === "sm" ? 14 : 16;

  return (
    <span
      className={`inline-flex shrink-0 items-center ${classes} bg-blue-50 font-black text-blue-700 ring-1 ring-blue-100 ${className}`}
      title="Проверенный исполнитель"
    >
      <BadgeCheck size={iconSize} strokeWidth={2.8} />
      Проверен
    </span>
  );
}
