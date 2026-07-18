import type { Timestamp } from "firebase/firestore";

export type AccountType = "individual" | "ip" | "ooo";

export type PaymentMethod = "cash" | "transfer";

export type ListingMedia = {
  type: "image" | "video";
  url: string;
  path: string;
  name: string;
  size?: number;
};

export type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  accountType: AccountType;
  companyName?: string;
  phone?: string;
  city?: string;
  avatarUrl?: string;
  avatarPath?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type Listing = {
  id: string;
  title: string;
  description: string;
  category: string;
  subcategory: string;
  city: string;
  priceFrom?: number | null;
  phone: string;

  paymentMethods?: PaymentMethod[];

  media?: ListingMedia[];
  imageUrls?: string[];
  videoUrls?: string[];

  authorId: string;
  authorName: string;
  authorAvatarUrl?: string;
  accountType: AccountType;

  viewsCount?: number;
  favoritesCount?: number;

  createdAt?: Timestamp;
};

export type Review = {
  id: string;
  listingId: string;
  authorId: string;
  authorName: string;
  rating: number;
  text: string;
  createdAt?: Timestamp;
};

export type Chat = {
  id: string;
  listingId: string;
  listingTitle: string;
  participantIds: string[];
  ownerId: string;
  ownerName: string;
  clientId: string;
  clientName: string;
  lastMessage?: string;
  updatedAt?: Timestamp;
  createdAt?: Timestamp;
};

export type Message = {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt?: Timestamp;
};


export type PortfolioItem = {
  id: string;
  userId: string;
  title: string;
  description?: string;
  city?: string;
  imageUrls?: string[];
  imagePaths?: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type AvailabilityStatus = "free" | "busy";

export type AvailabilityDay = {
  id: string;
  userId: string;
  date: string;
  status: AvailabilityStatus;
  updatedAt?: Timestamp;
};

export type CustomerRequest = {
  id: string;
  customerId: string;
  customerName?: string;
  title: string;
  description: string;
  category?: string;
  city?: string;
  budget?: number | null;
  status: "active" | "closed";
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type CustomerRequestOffer = {
  id: string;
  contractorId: string;
  contractorName?: string;
  message?: string;
  price?: number | null;
  createdAt?: Timestamp;
};

export type ComparisonSelection = {
  userIds: string[];
  updatedAt?: Timestamp;
};

export type AnalyticsEventType = "view" | "phone" | "chat";

export type ListingAnalyticsEvent = {
  id: string;
  listingId: string;
  userId: string;
  type: AnalyticsEventType;
  createdAt?: Timestamp;
};
