import { callableProfilePhone } from "./profile-contact-policy";

// Explicit allowlist: private profile documents must never be returned wholesale.
export function publicProfile(uid: string, source: Record<string, unknown>) {
  const result: Record<string, unknown> = { uid };
  const textFields = ["displayName", "name", "about", "city", "photoURL", "avatarUrl",
    "accountType", "companyName", "companyOfficialName", "companyShortName",
    "companyRegistryType", "companyRegistryStatus", "contactPreference"];
  for (const field of textFields) {
    if (typeof source[field] === "string") result[field] = source[field].slice(0, field === "about" ? 5000 : 1200);
  }
  // Registry details saved at business registration are displayed in public profiles.
  if (source.accountType === "ooo" || source.accountType === "ip") {
    const companyFields = ["companyInn", "companyOgrn", "companyKpp",
      "companyLegalAddress", "companyManagementName", "companyManagementPost"];
    for (const field of companyFields) {
      if (typeof source[field] === "string") result[field] = source[field].slice(0, 1200);
    }
  }
  // Only availability is public. The phone itself requires an authenticated request.
  result.hasPhone = Boolean(callableProfilePhone(source));
  result.verified = source.verified === true;
  result.isVerified = source.isVerified === true;
  result.verificationStatus = source.verificationStatus === "approved" ? "approved" : "unverified";
  result.online = source.online === true;
  for (const field of ["ratingAverage", "averageRating", "reviewsCount"]) {
    if (typeof source[field] === "number" && Number.isFinite(source[field])) result[field] = source[field];
  }
  for (const field of ["lastSeen", "lastActiveAt", "presenceUpdatedAt", "createdAt"]) {
    const value = source[field] as { seconds?: unknown; nanoseconds?: unknown } | undefined;
    if (value && typeof value.seconds === "number" && Number.isFinite(value.seconds)) {
      result[field] = { seconds: value.seconds, nanoseconds: typeof value.nanoseconds === "number" ? value.nanoseconds : 0 };
    }
  }
  return result;
}
