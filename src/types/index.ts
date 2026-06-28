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
