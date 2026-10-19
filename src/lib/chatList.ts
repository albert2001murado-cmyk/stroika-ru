import type { Timestamp } from "firebase/firestore";

export type ChatParticipant = {
  uid?: string;
  displayName?: string;
  name?: string;
  avatarUrl?: string;
  photoURL?: string;
};

export type Chat = {
  id: string;
  chatType?: "direct" | "group";
  isGroup?: boolean;
  groupTitle?: string;
  groupAvatarUrl?: string;
  participantIds?: string[];
  participants?: Record<string, ChatParticipant> | string[];
  users?: Record<string, ChatParticipant> | string[];
  buyerId?: string;
  sellerId?: string;
  clientId?: string;
  customerId?: string;
  contractorId?: string;
  authorId?: string;
  ownerId?: string;
  listingId?: string;
  listingTitle?: string;
  listingImageUrl?: string;
  lastMessageText?: string;
  lastMessageType?: "text" | "image" | "video" | "audio";
  lastSenderId?: string;
  lastMessageAt?: Timestamp;
  updatedAt?: Timestamp;
  createdAt?: Timestamp;
  pinnedBy?: string[] | Record<string, boolean> | string | null;
  unreadBy?: string[] | Record<string, boolean>;
  unreadCounts?: Record<string, number>;
  hiddenFor?: string[] | Record<string, boolean>;
};


export function getPinnedUserIds(
  value: Chat["pinnedBy"]
): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") return [value];
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([, enabled]) => enabled === true)
      .map(([uid]) => uid);
  }
  return [];
}

export function isChatPinned(chat: Chat, uid: string) {
  return getPinnedUserIds(chat.pinnedBy).includes(uid);
}

export function hasUserMarker(
  value: string[] | Record<string, boolean> | undefined,
  uid: string
) {
  if (!value || !uid) return false;
  if (Array.isArray(value)) return value.includes(uid);
  return value[uid] === true;
}

export function getUnreadCount(chat: Chat, uid: string) {
  const saved = Number(chat.unreadCounts?.[uid] || 0);
  if (Number.isFinite(saved) && saved > 0) return Math.floor(saved);
  return hasUserMarker(chat.unreadBy, uid) ? 1 : 0;
}

export function getParticipantIds(chat: Chat) {
  const ids = new Set<string>();

  if (Array.isArray(chat.participantIds)) {
    chat.participantIds.forEach((uid) => {
      if (typeof uid === "string" && uid) ids.add(uid);
    });
  }

  if (Array.isArray(chat.participants)) {
    chat.participants.forEach((uid) => {
      if (typeof uid === "string" && uid) ids.add(uid);
    });
  }

  if (Array.isArray(chat.users)) {
    chat.users.forEach((uid) => {
      if (typeof uid === "string" && uid) ids.add(uid);
    });
  } else if (chat.users) {
    Object.keys(chat.users).forEach((uid) => ids.add(uid));
  }

  if (chat.participants && !Array.isArray(chat.participants)) {
    Object.keys(chat.participants).forEach((uid) => ids.add(uid));
  }

  [
    chat.buyerId,
    chat.sellerId,
    chat.clientId,
    chat.customerId,
    chat.contractorId,
    chat.authorId,
    chat.ownerId,
  ].forEach((uid) => {
    if (typeof uid === "string" && uid) ids.add(uid);
  });

  return Array.from(ids);
}

export function isGroupChat(chat: Chat) {
  return chat.chatType === "group" || chat.isGroup === true;
}

export function memberCountLabel(value: number) {
  const count = Math.max(0, Math.floor(value || 0));
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} участников`;
  if (last === 1) return `${count} участник`;
  if (last >= 2 && last <= 4) return `${count} участника`;
  return `${count} участников`;
}

export function getChatDisplay(chat: Chat, myUid: string) {
  if (isGroupChat(chat)) {
    return {
      id: chat.id,
      displayName: chat.groupTitle?.trim() || "Групповой чат",
      avatarUrl: chat.groupAvatarUrl || "",
      isGroup: true,
    };
  }

  const otherId = getParticipantIds(chat).find((uid) => uid !== myUid) || "";
  const participantMap =
    chat.participants && !Array.isArray(chat.participants)
      ? chat.participants
      : undefined;
  const usersMap = chat.users && !Array.isArray(chat.users) ? chat.users : undefined;
  const participant =
    (otherId ? participantMap?.[otherId] : undefined) ||
    (otherId ? usersMap?.[otherId] : undefined);

  return {
    id: otherId,
    displayName:
      participant?.displayName || participant?.name || "Пользователь",
    avatarUrl: participant?.avatarUrl || participant?.photoURL || "",
    isGroup: false,
  };
}

export function getTime(chat: Chat) {
  return (
    chat.lastMessageAt?.toMillis?.() ||
    chat.updatedAt?.toMillis?.() ||
    chat.createdAt?.toMillis?.() ||
    0
  );
}

export function formatTime(chat: Chat) {
  const ms = getTime(chat);
  if (!ms) return "";

  const date = new Date(ms);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();

  if (isToday) {
    return new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

export function chatPreview(chat: Chat) {
  if (chat.lastMessageText) return chat.lastMessageText;
  if (chat.lastMessageType === "audio") return "Голосовое сообщение";
  if (chat.lastMessageType === "video") return "Видео";
  if (chat.lastMessageType === "image") return "Фото";
  return "Чат создан";
}

