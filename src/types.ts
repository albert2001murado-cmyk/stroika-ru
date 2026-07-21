export type AccountType = "individual" | "ip" | "ooo";
export type PaymentMethod = "cash" | "transfer";
export type MediaType = "image" | "video";

export type FirestoreDate = any;

export type VerificationStatus =
  | "unverified"
  | "pending"
  | "approved"
  | "rejected";

export type CompanyRegistryType = "LEGAL" | "INDIVIDUAL";
export type CompanyRegistryStatus =
  | "ACTIVE"
  | "LIQUIDATING"
  | "LIQUIDATED"
  | "BANKRUPT"
  | "REORGANIZING";

export type CompanyLookupResult = {
  inn: string;
  kpp?: string;
  ogrn: string;
  officialName: string;
  shortName: string;
  legalAddress?: string;
  registryType: CompanyRegistryType;
  registryStatus: CompanyRegistryStatus;
  managementName?: string;
  managementPost?: string;
  registrationDate?: number | null;
};



export type UserProfile = {
  uid: string;
  email?: string | null;
  username?: string;
  displayName?: string;
  name?: string;
  representativeName?: string;
  photoURL?: string;
  avatarUrl?: string;
  avatarPath?: string;
  about?: string;
  online?: boolean;
  friends?: string[];
  favoriteGames?: string[];
  level?: number;
  xp?: number;
  accountType?: AccountType;
  companyName?: string;
  companyOfficialName?: string;
  companyShortName?: string;
  companyInn?: string;
  companyKpp?: string;
  companyOgrn?: string;
  companyLegalAddress?: string;
  companyRegistryType?: CompanyRegistryType;
  companyRegistryStatus?: CompanyRegistryStatus;
  companyManagementName?: string;
  companyManagementPost?: string;
  companyLookupProvider?: "dadata";
  companyRegistryCheckedAt?: FirestoreDate;
  city?: string;
  phone?: string;
  verified?: boolean;
  isVerified?: boolean;
  verificationStatus?: VerificationStatus;
  verifiedAt?: FirestoreDate | null;
  verifiedBy?: string;
  createdAt?: FirestoreDate;
  updatedAt?: FirestoreDate;
  [key: string]: unknown;
};


export type Review = {
  id: string;
  listingId: string;
  authorId?: string;
  authorName?: string;
  authorAvatarUrl?: string;
  rating: number;
  text: string;
  createdAt?: FirestoreDate;
  updatedAt?: FirestoreDate;
  [key: string]: unknown;
};

export type ListingMedia = {
  type: MediaType;
  url: string;
  path?: string;
  name?: string;
  size?: number;
};

export type ListingLocation = {
  lat: number;
  lng: number;
  address?: string;
};

export type Listing = {
  id: string;
  title: string;
  description?: string;
  category?: string;
  subcategory?: string;
  city?: string;
  address?: string;
  phone?: string;
  priceFrom?: number | null;
  priceTo?: number | null;
  paymentMethods?: PaymentMethod[];
  media?: ListingMedia[];
  imageUrls?: string[];
  videoUrls?: string[];
  authorId?: string;
  authorName?: string;
  authorAvatarUrl?: string;
  accountType?: AccountType;
  authorVerified?: boolean;
  verified?: boolean;
  isVerified?: boolean;
  verificationStatus?: string;
  viewsCount?: number;
  favoritesCount?: number;
  searchGroup?: string;
  offerAction?: string;
  offerActionLabel?: string;
  offerFeatures?: Record<string, boolean>;
  searchTags?: string[];
  searchText?: string;
  searchVersion?: number;
  location?: ListingLocation | null;
  lat?: number | null;
  lng?: number | null;
  geocodedAddress?: string;
  createdAt?: FirestoreDate;
  updatedAt?: FirestoreDate;
  [key: string]: unknown;
};

export type CustomerRequestStatus = "active" | "closed";
export type CustomerRequestUrgency = "urgent" | "normal";

export type CustomerRequest = {
  id: string;
  customerId: string;
  customerName?: string;
  customerAvatar?: string;
  customerPhone?: string;
  title: string;
  description: string;
  category?: string;
  subcategory?: string;
  city?: string;
  budget?: number | null;
  budgetFrom?: number | null;
  budgetTo?: number | null;
  deadline?: string;
  urgency?: CustomerRequestUrgency;
  status: CustomerRequestStatus;
  imageUrls?: string[];
  offersCount?: number;
  viewsCount?: number;
  createdAt?: FirestoreDate;
  updatedAt?: FirestoreDate;
  [key: string]: unknown;
};

export function firestoreDateToMillis(value?: FirestoreDate): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

export function isCreatedWithinHours(
  value: FirestoreDate | undefined,
  hours: number
): boolean {
  const createdAt = firestoreDateToMillis(value);
  if (!createdAt) return false;

  const age = Date.now() - createdAt;
  return age >= 0 && age < hours * 60 * 60 * 1000;
}
