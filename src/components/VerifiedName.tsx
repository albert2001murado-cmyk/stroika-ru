"use client";

import VerifiedBadge from "./VerifiedBadge";

type VerifiedNameProps = {
  name: string;
  verified?: boolean;
  badgeSize?: "sm" | "md" | "lg";
  className?: string;
};

export default function VerifiedName({
  name,
  verified,
  badgeSize = "sm",
  className = "",
}: VerifiedNameProps) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className}`}>
      <span className="min-w-0 truncate">{name}</span>
      {verified ? <VerifiedBadge size={badgeSize} /> : null}
    </span>
  );
}
