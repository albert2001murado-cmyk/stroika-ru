"use client";
import { uploadAuthHeaders } from "@/lib/uploadAuth";
import { setChatPinned } from "@/lib/chatPin";
import styles from "../messages.module.css";


import { useAuth } from "@/components/AuthProvider";
import ReportDialog from "@/components/ReportDialog";
import UserBlockButton from "@/components/UserBlockButton";
import { db } from "@/lib/firebase";
import { getApiUrl } from "@/lib/getApiUrl";
import { bankDetailsFromProfile, bankDetailsMessageText, formatBankDetailsMessage, isBankDetailsMessage, validatePayment } from "@/lib/payments";
import { GROUP_INVITE_URL_PATTERN } from "@/lib/brand";
import type { Timestamp } from "firebase/firestore";
import { arrayUnion, collection, deleteDoc, doc, getDoc, increment, onSnapshot, orderBy, query, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { ArrowLeft, ArrowDown, ArrowUpRight, MessageCircle, Check, CheckCheck, Edit3, FileText, ImagePlus, Landmark, Loader2, Mic, MoreVertical, Pause, Pin, PinOff, Play, Send, Settings, Trash2, UserRound, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

type ChatParticipant = {
  uid?: string;
  displayName?: string;
  name?: string;
  avatarUrl?: string;
  photoURL?: string;
};

function BankMessageCard({ text, mine }: { text: string; mine: boolean }) {
  const lines = text.split("\n").slice(1).filter(Boolean);
  return <div className={styles.bankCard}>
    <div className={styles.bankHeading}><Landmark size={18} /><span>Реквизиты получателя</span></div>
    <div className={styles.bankLines}>{lines.map((line) => <p key={line}>{line}</p>)}</div>
  </div>;
}

type Chat = {
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
  listingImage?: string;
  pinnedBy?: string[] | Record<string, boolean> | string | null;
  unreadBy?: string[] | Record<string, boolean>;
  unreadCounts?: Record<string, number>;
};

type MessageType = "text" | "image" | "video" | "audio" | "document" | "mixed";

type ChatMessage = {
  id: string;
  senderId: string;
  senderName?: string;
  senderAvatarUrl?: string;
  text?: string;
  type?: MessageType;
  mediaUrl?: string;
  mediaPath?: string;
  mediaType?: string;
  fileName?: string;
  imageUrl?: string;
  imagePath?: string;
  createdAt?: Timestamp;
  editedAt?: Timestamp;
  hiddenFor?: string[] | Record<string, boolean>;
  pinned?: boolean;
  readBy?: string[] | Record<string, boolean>;
  deliveredTo?: string[] | Record<string, boolean>;
};

type UploadedChatFile = {
  type: "image" | "video" | "audio" | "document";
  url: string;
  path: string;
  name?: string;
  mimeType?: string;
};


function getPinnedUserIds(
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

function isChatPinned(chat: Chat | null, uid: string) {
  return Boolean(chat && getPinnedUserIds(chat.pinnedBy).includes(uid));
}

function hasUserMarker(
  value: string[] | Record<string, boolean> | undefined,
  uid: string
) {
  if (!value || !uid) return false;
  if (Array.isArray(value)) return value.includes(uid);
  return value[uid] === true;
}

function getParticipantIds(chat: Chat | null) {
  if (!chat) return [];
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

function getParticipant(chat: Chat | null, uid: string) {
  if (!chat || !uid) return null;
  const participantMap =
    chat.participants && !Array.isArray(chat.participants)
      ? chat.participants
      : undefined;
  const usersMap = chat.users && !Array.isArray(chat.users) ? chat.users : undefined;
  return participantMap?.[uid] || usersMap?.[uid] || null;
}

function timestampMillis(value?: Timestamp) {
  return value?.toMillis?.() || 0;
}

function formatTime(value?: Timestamp) {
  if (!value?.toDate) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value.toDate());
}

function dayKey(value?: Timestamp) {
  const millis = timestampMillis(value);
  if (!millis) return "";
  return new Date(millis).toDateString();
}

function formatDay(value?: Timestamp) {
  const millis = timestampMillis(value);
  if (!millis) return "";

  const date = new Date(millis);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Сегодня";
  if (date.toDateString() === yesterday.toDateString()) return "Вчера";

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  }).format(date);
}

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, "0")}`;
}

function messagePreview(message: ChatMessage) {
  if (message.text) return bankDetailsMessageText(message.text);
  if (message.type === "audio") return "Голосовое сообщение";
  if (message.type === "video") return "Видео";
  if (message.type === "document") return message.fileName || "Файл";
  if (message.type === "image" || message.type === "mixed" || message.imageUrl) {
    return "Фото";
  }
  return "Сообщение";
}

type GroupInvitePreview = {
  id: string;
  title: string;
  avatarUrl?: string;
  memberCount: number;
};

function getGroupInviteToken(text?: string) {
  return text?.match(GROUP_INVITE_URL_PATTERN)?.[1] || "";
}

function withoutGroupInviteUrl(text?: string) {
  return (text || "")
    .replace(GROUP_INVITE_URL_PATTERN, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function memberCountLabel(value: number) {
  const count = Math.max(0, Math.floor(value || 0));
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} участников`;
  if (last === 1) return `${count} участник`;
  if (last >= 2 && last <= 4) return `${count} участника`;
  return `${count} участников`;
}

function GroupInviteCard({ token, mine }: { token: string; mine: boolean }) {
  const [preview, setPreview] = useState<GroupInvitePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingPreview(true);
    setPreviewUnavailable(false);

    fetch(getApiUrl(`/api/groups/resolve?token=${encodeURIComponent(token)}`), {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data?.group) throw new Error("GROUP_NOT_FOUND");
        setPreview(data.group as GroupInvitePreview);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPreviewUnavailable(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingPreview(false);
      });

    return () => controller.abort();
  }, [token]);

  return <div className={styles.inviteCard}>
    <div className={styles.inviteHead}>
      <div className={styles.headerAvatar}>{preview?.avatarUrl ? <img src={preview.avatarUrl} alt="" /> : <UsersRound size={23} />}</div>
      <span><b>{loadingPreview ? "Загружаем группу…" : preview?.title || "Приглашение в группу"}</b><small>{preview ? memberCountLabel(preview.memberCount) : previewUnavailable ? "Откройте приглашение для просмотра" : "Проверяем участников…"}</small></span>
    </div>
    <Link href={`/join/${token}`} className={styles.primaryButton}>Открыть приглашение<ArrowUpRight size={14} /></Link>
  </div>;
}

function chooseRecordingMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const types = [
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function VoiceMessage({ url, mine }: { url: string; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [speed, setSpeed] = useState(1);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }

  function changeSpeed() {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;

  return <div className={styles.voice}>
    <audio ref={audioRef} src={url} preload="metadata"
      onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
      onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setCurrent(0); }} />
    <button type="button" onClick={togglePlay} aria-label={playing ? "Пауза" : "Воспроизвести"}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button>
    <div className={styles.voiceBody}>
      <div className={styles.voiceWaves} aria-hidden="true">{Array.from({ length: 32 }).map((_, index) => <span key={index} data-active={index / 31 <= progress / 100} style={{ height: 7 + ((index * 13 + 9) % 18) }} />)}</div>
      <input type="range" min={0} max={duration || 0} step={0.05} value={Math.min(current, duration || 0)} onChange={(event) => { const next = Number(event.target.value); setCurrent(next); if (audioRef.current) audioRef.current.currentTime = next; }} aria-label="Позиция голосового сообщения" />
      <div className={styles.voiceMeta}><span>{formatDuration(current || duration)}</span><button type="button" onClick={changeSpeed} aria-label="Скорость воспроизведения">{speed}×</button></div>
    </div>
  </div>;
}

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const chatId = String(params.chatId);
  const { user, profile, loading } = useAuth();

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const threadRef = useRef<HTMLElement | null>(null);
  const firstScrollRef = useRef(true);
  const nearBottomRef = useRef(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingCancelledRef = useRef(false);

  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState("");
  const [openMenuId, setOpenMenuId] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState("");
  const [mediaKind, setMediaKind] = useState<"image" | "video" | "document" | "">("");
  const [pageLoading, setPageLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [error, setError] = useState("");
  const [blockedEither, setBlockedEither] = useState(false);
  const [highlightedId, setHighlightedId] = useState("");
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const participantIds = useMemo(() => getParticipantIds(chat), [chat]);
  const isGroup = chat?.chatType === "group" || chat?.isGroup === true;
  const otherId = useMemo(
    () => participantIds.find((uid) => uid !== user?.uid) || "",
    [participantIds, user?.uid]
  );
  const other = getParticipant(chat, otherId);
  const otherName = other?.displayName || other?.name || "Пользователь";
  const otherAvatar = other?.avatarUrl || other?.photoURL || "";
  const headerName = isGroup ? chat?.groupTitle || "Групповой чат" : otherName;
  const headerAvatar = isGroup ? chat?.groupAvatarUrl || "" : otherAvatar;
  const chatPinned = Boolean(user && isChatPinned(chat, user.uid));

  useEffect(() => {
    if (!user || !otherId || isGroup) {
      setBlockedEither(false);
      return;
    }

    Promise.all([
      getDoc(doc(db, "users", user.uid, "blocked", otherId)),
      getDoc(doc(db, "users", otherId, "blocked", user.uid)),
    ])
      .then(([mine, theirs]) => setBlockedEither(mine.exists() || theirs.exists()))
      .catch(() => undefined);
  }, [isGroup, otherId, user]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/auth");
      return;
    }

    return onSnapshot(
      doc(db, "chats", chatId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setError("Чат не найден.");
          setPageLoading(false);
          return;
        }

        const next = { id: snapshot.id, ...snapshot.data() } as Chat;
        if (!getParticipantIds(next).includes(user.uid)) {
          setError("Нет доступа к чату.");
          setPageLoading(false);
          return;
        }

        setError("");
        setChat(next);
        setPageLoading(false);
      },
      (snapshotError) => {
        console.error("[chat] Firestore subscription failed", snapshotError);
        setError("Не получилось открыть чат.");
        setPageLoading(false);
      }
    );
  }, [chatId, loading, router, user]);

  useEffect(() => {
    if (!user || !chat) return;

    const messagesQuery = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "asc")
    );

    return onSnapshot(messagesQuery, async (snapshot) => {
      const allMessages = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      })) as ChatMessage[];

      setMessages(
        allMessages.filter((item) => !hasUserMarker(item.hiddenFor, user.uid))
      );

      const unread = allMessages.filter(
        (item) =>
          item.senderId !== user.uid && !hasUserMarker(item.readBy, user.uid)
      );
      const chatHasUnread =
        hasUserMarker(chat.unreadBy, user.uid) ||
        Number(chat.unreadCounts?.[user.uid] || 0) > 0;

      if (unread.length === 0 && !chatHasUnread) return;

      try {
        const batch = writeBatch(db);
        unread.slice(-450).forEach((item) => {
          const messageRef = doc(db, "chats", chatId, "messages", item.id);
          const readUpdate = Array.isArray(item.readBy)
            ? { readBy: arrayUnion(user.uid) }
            : { [`readBy.${user.uid}`]: true };
          const deliveredUpdate = Array.isArray(item.deliveredTo)
            ? { deliveredTo: arrayUnion(user.uid) }
            : { [`deliveredTo.${user.uid}`]: true };

          batch.update(messageRef, {
            ...readUpdate,
            ...deliveredUpdate,
            updatedAt: serverTimestamp(),
          });
        });
        const chatUnreadUpdate = Array.isArray(chat.unreadBy)
          ? { unreadBy: chat.unreadBy.filter((uid) => uid !== user.uid) }
          : { [`unreadBy.${user.uid}`]: false };
        batch.update(doc(db, "chats", chatId), {
          ...chatUnreadUpdate,
          [`unreadCounts.${user.uid}`]: 0,
        });
        await batch.commit();
      } catch (readError) {
        console.error("[chat] Failed to mark messages as read", readError);
      }
    });
  }, [chat, chatId, user]);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread || !messages.length) return;
    const ownMessage = messages[messages.length - 1]?.senderId === user?.uid;
    if (firstScrollRef.current || nearBottomRef.current || ownMessage) {
      thread.scrollTo({ top: thread.scrollHeight, behavior: firstScrollRef.current ? "auto" : "smooth" });
      firstScrollRef.current = false;
    } else {
      setShowScrollBottom(true);
    }
  }, [messages.length, user?.uid]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current?.state === "recording") {
        recordingCancelledRef.current = true;
        mediaRecorderRef.current.stop();
      }
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    };
  }, [mediaPreview]);

  function handleMediaChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const kind = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("video/")
      ? "video"
      : "document";

    const limit = kind === "image"
      ? 10 * 1024 * 1024
      : kind === "video"
      ? 80 * 1024 * 1024
      : 25 * 1024 * 1024;
    if (file.size > limit) {
      setError(kind === "image" ? "Фото больше 10 МБ." : kind === "video" ? "Видео больше 80 МБ." : "Файл больше 25 МБ.");
      return;
    }

    removeMedia();
    setMediaFile(file);
    setMediaKind(kind);
    setMediaPreview(kind === "document" ? "" : URL.createObjectURL(file));
    setError("");
  }

  function removeMedia() {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(null);
    setMediaPreview("");
    setMediaKind("");
  }

  async function uploadChatFile(file: File): Promise<UploadedChatFile> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(getApiUrl("/api/chat-upload"), { headers: await uploadAuthHeaders(),
      method: "POST",
      body: formData,
    });
    const raw = await response.text();
    let data: any = null;

    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      throw new Error("Сервер загрузки не вернул корректный ответ.");
    }

    if (!response.ok || !data?.url) {
      throw new Error(data?.error || "Не получилось загрузить файл.");
    }

    return {
      type: data.type,
      url: data.url,
      path: data.path || "",
      name: data.name || file.name,
      mimeType: data.mimeType || file.type,
    };
  }

  async function createMessage(input: {
    text?: string;
    uploaded?: UploadedChatFile | null;
  }) {
    if (!user || !chat) return;

    const clean = input.text?.trim() || "";
    const uploaded = input.uploaded || null;
    const type: MessageType = uploaded?.type || "text";
    const senderName =
      profile?.displayName || user.displayName || user.email || "Пользователь";
    const senderAvatarUrl = profile?.avatarUrl || user.photoURL || "";
    const preview = isBankDetailsMessage(clean)
      ? "Реквизиты для оплаты"
      : clean
      ? clean
      : type === "audio"
      ? "Голосовое сообщение"
      : type === "video"
      ? "Видео"
      : type === "document"
      ? uploaded?.name || "Файл"
      : "Фото";

    const recipients = participantIds.filter((uid) => uid !== user.uid);
    const messageRef = doc(collection(db, "chats", chatId, "messages"));
    const chatRef = doc(db, "chats", chatId);
    const batch = writeBatch(db);

    batch.set(messageRef, {
      chatId,
      senderId: user.uid,
      senderName,
      senderAvatarUrl,
      text: clean,
      type,
      mediaUrl: uploaded?.url || "",
      mediaPath: uploaded?.path || "",
      mediaType: uploaded?.mimeType || "",
      fileName: uploaded?.name || "",
      imageUrl: uploaded?.type === "image" ? uploaded.url : "",
      imagePath: uploaded?.type === "image" ? uploaded.path : "",
      hiddenFor: {},
      pinned: false,
      readBy: { [user.uid]: true },
      deliveredTo: { [user.uid]: true },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const chatUpdates: Record<string, unknown> = {
      lastMessageText: preview,
      lastMessageType: type,
      lastMessageAt: serverTimestamp(),
      lastSenderId: user.uid,
      updatedAt: serverTimestamp(),
    };
    if (Array.isArray(chat.unreadBy)) {
      chatUpdates.unreadBy = arrayUnion(...recipients);
    }
    recipients.forEach((recipientId) => {
      if (!Array.isArray(chat.unreadBy)) {
        chatUpdates[`unreadBy.${recipientId}`] = true;
      }
      chatUpdates[`unreadCounts.${recipientId}`] = increment(1);
    });
    batch.update(chatRef, chatUpdates);
    await batch.commit();

    if (recipients.length > 0) {
      user
        .getIdToken()
        .then((token) => Promise.allSettled(recipients.map((recipientId) =>
          fetch(getApiUrl("/api/push/send"), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              recipientId,
              title: isGroup ? chat.groupTitle || senderName : senderName,
              body: type === "audio" ? "🎤 Голосовое сообщение" : type === "video" ? "📹 Видео" : type === "image" ? "📷 Фото" : type === "document" ? `📎 ${uploaded?.name || "Файл"}` : clean,
              url: `/messages/${chatId}`,
              chatId,
            }),
          })
        )))
        .catch(() => undefined);
    }
  }

  async function handleSend(event?: FormEvent) {
    event?.preventDefault();
    if (!user || !chat || sending || voiceUploading) return;
    if (blockedEither) {
      setError("Отправка сообщений заблокирована.");
      return;
    }

    const clean = text.trim();

    if (editingId) {
      if (!clean) return;
      setSending(true);
      setError("");
      try {
        await updateDoc(doc(db, "chats", chatId, "messages", editingId), {
          text: clean,
          editedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setEditingId("");
        setText("");
      } catch (sendError) {
        setError(
          sendError instanceof Error
            ? sendError.message
            : "Не получилось изменить сообщение."
        );
      } finally {
        setSending(false);
      }
      return;
    }

    if (!clean && !mediaFile) return;

    setSending(true);
    setError("");
    try {
      const uploaded = mediaFile ? await uploadChatFile(mediaFile) : null;
      await createMessage({ text: clean, uploaded });
      setText("");
      removeMedia();
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Не получилось отправить сообщение."
      );
    } finally {
      setSending(false);
    }
  }

  async function shareBankDetails() {
    if (!user || !chat || sending) return;
    const bank = bankDetailsFromProfile(profile as any);
    const validation = validatePayment(["bank_account"], bank, profile?.accountType, profile?.bankDetailsConfirmed);
    if (validation) {
      setError(`${validation} Откройте профиль и сохраните актуальные реквизиты.`);
      return;
    }
    setSending(true);
    setError("");
    try {
      await createMessage({ text: formatBankDetailsMessage(bank) });
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Не получилось отправить реквизиты.");
    } finally {
      setSending(false);
    }
  }

  async function startRecording() {
    if (blockedEither || recording || voiceUploading) return;

    if (
      typeof window === "undefined" ||
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError("Этот браузер не поддерживает запись голосовых сообщений.");
      return;
    }

    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const mimeType = chooseRecordingMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      recordingCancelledRef.current = false;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        mediaRecorderRef.current = null;

        if (recordingCancelledRef.current) {
          recordingChunksRef.current = [];
          return;
        }

        const chunks = recordingChunksRef.current;
        recordingChunksRef.current = [];
        if (chunks.length === 0) {
          setError("Голосовое сообщение не записалось.");
          return;
        }

        const actualMime = recorder.mimeType || mimeType || "audio/webm";
        const extension = actualMime.includes("mp4")
          ? "m4a"
          : actualMime.includes("ogg")
          ? "ogg"
          : "webm";
        const blob = new Blob(chunks, { type: actualMime });
        const file = new File([blob], `voice-${Date.now()}.${extension}`, {
          type: actualMime,
        });

        setVoiceUploading(true);
        try {
          const uploaded = await uploadChatFile(file);
          await createMessage({ uploaded });
        } catch (voiceError) {
          setError(
            voiceError instanceof Error
              ? voiceError.message
              : "Не получилось отправить голосовое."
          );
        } finally {
          setVoiceUploading(false);
        }
      };

      recorder.start(250);
      setRecordSeconds(0);
      setRecording(true);
      recordingTimerRef.current = setInterval(
        () => setRecordSeconds((seconds) => seconds + 1),
        1000
      );
    } catch {
      setError(
        "Не удалось получить доступ к микрофону. Разреши микрофон в настройках браузера."
      );
    }
  }

  function stopRecording(send: boolean) {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    recordingCancelledRef.current = !send;
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    setRecording(false);
    setRecordSeconds(0);

    if (recorder.state !== "inactive") recorder.stop();
  }

  async function toggleChatPin() {
    if (!user || !chat) return;
    await setChatPinned(chatId, chat.pinnedBy, user.uid, !chatPinned)
      .catch(() => setError("Не получилось закрепить чат."));
  }

  async function togglePin(message: ChatMessage) {
    await updateDoc(doc(db, "chats", chatId, "messages", message.id), {
      pinned: !message.pinned,
      updatedAt: serverTimestamp(),
    }).catch(() => setError("Не получилось изменить закрепление."));
    setOpenMenuId("");
  }

  function beginEdit(message: ChatMessage) {
    setEditingId(message.id);
    setText(message.text || "");
    removeMedia();
    setOpenMenuId("");
  }

  async function hideForMe(message: ChatMessage) {
    if (!user) return;

    const hiddenUpdate = Array.isArray(message.hiddenFor)
      ? { hiddenFor: arrayUnion(user.uid) }
      : { [`hiddenFor.${user.uid}`]: true };

    await updateDoc(doc(db, "chats", chatId, "messages", message.id), {
      ...hiddenUpdate,
      updatedAt: serverTimestamp(),
    }).catch(() => setError("Не получилось удалить сообщение у тебя."));
    setOpenMenuId("");
  }

  async function deleteForEveryone(message: ChatMessage) {
    if (!confirm("Удалить сообщение у всех участников?")) return;
    await deleteDoc(doc(db, "chats", chatId, "messages", message.id)).catch(() =>
      setError("Не получилось удалить сообщение.")
    );
    setOpenMenuId("");
  }

  function scrollToMessage(messageId: string) {
    document.getElementById(`chat-message-${messageId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    setHighlightedId(messageId);
    window.setTimeout(() => setHighlightedId(""), 1300);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void handleSend();
    }
  }

  if (loading || pageLoading) {
    return <section className={styles.conversationState} aria-busy="true"><Loader2 size={25} className={styles.spinner} /><p>Открываем переписку…</p></section>;
  }
  if (error && !chat) {
    return <section className={styles.conversationState}><h1>{error}</h1><p>Обновите страницу или выберите другую переписку.</p><button type="button" className={styles.primaryButton} onClick={() => window.location.reload()}>Повторить</button><Link href="/messages">Все сообщения</Link></section>;
  }

  const pinnedMessages = messages.filter((item) => item.pinned);
  const lastPinned = pinnedMessages[pinnedMessages.length - 1];
  const listingImage = chat?.listingImageUrl || chat?.listingImage || "";

  return <section className={styles.conversation} aria-label={`Переписка: ${headerName}`}>
    <header className={styles.header}>
      <Link href="/messages" className={styles.back} aria-label="Все чаты"><ArrowLeft size={21} /></Link>
      <Link href={isGroup ? `/messages/${chatId}/info` : otherId ? `/user/${otherId}` : "/messages"} className={styles.identity}>
        <span className={styles.headerAvatar}>{headerAvatar ? <img src={headerAvatar} alt="" /> : isGroup ? <UsersRound size={22} /> : <UserRound size={22} />}</span>
        <div className={styles.headerIdentity}><h1>{headerName}</h1><p>{isGroup ? memberCountLabel(participantIds.length) : "Личная переписка"}</p></div>
      </Link>
      <div className={styles.headerActions}>
        <button type="button" className={styles.iconButton} onClick={toggleChatPin} aria-pressed={chatPinned} aria-label={chatPinned ? "Открепить чат" : "Закрепить чат"} title={chatPinned ? "Открепить чат" : "Закрепить чат"}><Pin size={17} fill={chatPinned ? "currentColor" : "none"} /></button>
        {isGroup ? <Link href={`/messages/${chatId}/info`} className={styles.iconButton} aria-label="Настройки группы" title="Настройки группы"><Settings size={18} /></Link> : otherId ? <details className={styles.moreMenu}>
          <summary className={styles.iconButton} aria-label="Действия с перепиской" title="Действия с перепиской"><MoreVertical size={19} /></summary>
          <div className={styles.menuPanel}>
            <ReportDialog targetType="chat" targetId={chatId} targetOwnerId={otherId} targetTitle={`Чат с ${otherName}`} buttonClassName={styles.menuItem} />
            <UserBlockButton targetUserId={otherId} className={styles.menuItem} onChange={() => { if (!user) return; Promise.all([getDoc(doc(db, "users", user.uid, "blocked", otherId)), getDoc(doc(db, "users", otherId, "blocked", user.uid))]).then(([mine, theirs]) => setBlockedEither(mine.exists() || theirs.exists())).catch(() => undefined); }} />
          </div>
        </details> : null}
      </div>
    </header>

    {chat?.listingTitle ? <Link href={chat.listingId ? `/listing/${chat.listingId}` : "#"} className={styles.context}>
      {listingImage ? <img src={listingImage} alt="" /> : <span className={styles.contextImage}><ImagePlus size={17} /></span>}
      <span><small>Обсуждаем объявление</small><strong>{chat.listingTitle}</strong></span><ArrowUpRight size={17} className={styles.contextArrow} />
    </Link> : null}
    {lastPinned ? <button type="button" className={styles.pinnedMessage} onClick={() => scrollToMessage(lastPinned.id)}><Pin size={16} /><span><b>Закреплённое сообщение{pinnedMessages.length > 1 ? ` · ${pinnedMessages.length}` : ""}</b><small>{messagePreview(lastPinned)}</small></span></button> : null}

    <div className={styles.threadArea}>
      <section ref={threadRef} className={styles.thread} onClick={() => openMenuId && setOpenMenuId("")} onScroll={(event) => { const thread = event.currentTarget; const near = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 150; nearBottomRef.current = near; setShowScrollBottom(!near); }} aria-label="Сообщения">
        {messages.length === 0 ? <div className={styles.emptyThread}><MessageCircle size={29} strokeWidth={1.5} /><h3>Начните разговор</h3><p>Можно отправить сообщение, фото или документ.</p></div> : messages.map((message, index) => {
          const isMine = message.senderId === user?.uid;
          const receiptUsers = participantIds.filter((uid) => uid !== user?.uid);
          const isRead = receiptUsers.length > 0 && receiptUsers.every((uid) => hasUserMarker(message.readBy, uid));
          const isDelivered = receiptUsers.length > 0 && receiptUsers.every((uid) => hasUserMarker(message.deliveredTo, uid));
          const showDay = index === 0 || dayKey(messages[index - 1]?.createdAt) !== dayKey(message.createdAt);
          const imageUrl = message.type === "image" || message.type === "mixed" ? message.mediaUrl || message.imageUrl || "" : message.imageUrl || "";
          const videoUrl = message.type === "video" ? message.mediaUrl || "" : "";
          const audioUrl = message.type === "audio" ? message.mediaUrl || "" : "";
          const documentUrl = message.type === "document" ? message.mediaUrl || "" : "";
          const groupInviteToken = getGroupInviteToken(message.text);
          const visibleMessageText = bankDetailsMessageText(groupInviteToken ? withoutGroupInviteUrl(message.text) : message.text?.trim() || "");
          const bankDetailsMessage = isBankDetailsMessage(visibleMessageText);
          return <div key={message.id}>
            {showDay ? <div className={styles.day}><span>{formatDay(message.createdAt)}</span></div> : null}
            <div id={`chat-message-${message.id}`} data-message-id={message.id} data-mine={isMine} className={styles.messageRow}>
              <div className={styles.messageWrap}>
                <div className={styles.bubble} data-highlighted={highlightedId === message.id}>
                  {message.pinned ? <span className={styles.messagePin}><Pin size={10} />Закреплено</span> : null}
                  {isGroup && !isMine ? <p className={styles.messageSender}>{message.senderName || getParticipant(chat, message.senderId)?.displayName || getParticipant(chat, message.senderId)?.name || "Участник"}</p> : null}
                  {imageUrl ? <a href={imageUrl} target="_blank" rel="noreferrer"><img src={imageUrl} alt="Фотография в сообщении" className={styles.messagePhoto} onLoad={() => { if (nearBottomRef.current) threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight }); }} /></a> : null}
                  {videoUrl ? <video src={videoUrl} controls playsInline preload="metadata" className={styles.messageVideo} /> : null}
                  {audioUrl ? <VoiceMessage url={audioUrl} mine={isMine} /> : null}
                  {documentUrl ? <a href={documentUrl} target="_blank" rel="noreferrer" className={styles.attachment}><FileText size={23} /><span><b>{message.fileName || "Документ"}</b><small>Открыть файл</small></span><ArrowUpRight size={14} /></a> : null}
                  {groupInviteToken ? <GroupInviteCard token={groupInviteToken} mine={isMine} /> : null}
                  {bankDetailsMessage ? <BankMessageCard text={visibleMessageText} mine={isMine} /> : visibleMessageText ? <p className={styles.messageText}>{visibleMessageText}</p> : null}
                  <div className={styles.receipt} data-read={isRead}>{message.editedAt ? <span>изменено</span> : null}<time>{formatTime(message.createdAt)}</time>{isMine ? isRead || isDelivered ? <CheckCheck size={13} /> : <Check size={13} /> : null}</div>
                </div>
                <button type="button" className={styles.messageMenuButton} aria-label="Действия с сообщением" aria-expanded={openMenuId === message.id} onClick={(event) => { event.stopPropagation(); setOpenMenuId(openMenuId === message.id ? "" : message.id); }}><MoreVertical size={15} /></button>
                {openMenuId === message.id ? <div className={styles.messageMenu} onClick={event => event.stopPropagation()}>
                  <button type="button" onClick={() => togglePin(message)}>{message.pinned ? <PinOff size={16} /> : <Pin size={16} />}{message.pinned ? "Открепить" : "Закрепить"}</button>
                  {isMine && message.type === "text" ? <button type="button" onClick={() => beginEdit(message)}><Edit3 size={16} />Изменить</button> : null}
                  {!isMine ? <ReportDialog targetType="message" targetId={message.id} targetOwnerId={message.senderId} targetTitle="Сообщение в чате" targetSnapshot={{ chatId, text: message.text || "", imageUrl, mediaUrl: message.mediaUrl || "", type: message.type || "text" }} buttonClassName={styles.menuItem} /> : null}
                  <button type="button" onClick={() => hideForMe(message)}><Trash2 size={16} />Удалить у меня</button>
                  {isMine ? <button type="button" data-danger="true" onClick={() => deleteForEveryone(message)}><Trash2 size={16} />Удалить у всех</button> : null}
                </div> : null}
              </div>
            </div>
          </div>;
        })}
        <div ref={bottomRef} />
      </section>
      {showScrollBottom ? <button type="button" className={styles.scrollDown} onClick={() => { nearBottomRef.current = true; threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" }); }} aria-label="К последнему сообщению"><ArrowDown size={19} /></button> : null}
    </div>

    {mediaFile ? <div className={styles.previewBar}>
      {mediaKind === "image" ? <img src={mediaPreview} alt="Предпросмотр вложения" /> : mediaKind === "video" ? <video src={mediaPreview} muted /> : <FileText size={25} />}
      <span><b>{mediaFile.name}</b><small>{mediaKind === "image" ? "Фотография" : mediaKind === "video" ? "Видео" : "Документ"}</small></span><button type="button" className={styles.iconButton} onClick={removeMedia} aria-label="Удалить вложение"><X size={18} /></button>
    </div> : null}
    {editingId ? <div className={styles.editBar}><Edit3 size={16} /><span>Редактирование сообщения</span><button type="button" className={styles.iconButton} onClick={() => { setEditingId(""); setText(""); }} aria-label="Отменить редактирование"><X size={17} /></button></div> : null}
    {error ? <div className={styles.errorBar} role="alert"><span>{error}</span><button type="button" className={styles.iconButton} onClick={() => setError("")} aria-label="Скрыть ошибку"><X size={16} /></button></div> : null}

    <div className={styles.composerArea}>
      {blockedEither ? <div className={styles.errorBar}>Отправка сообщений заблокирована</div> : recording ? <div className={styles.recording}>
        <span><i />Идёт запись<time>{formatDuration(recordSeconds)}</time></span><button type="button" className={styles.iconButton} onClick={() => stopRecording(false)} aria-label="Отменить запись"><X size={20} /></button><button type="button" className={styles.send} onClick={() => stopRecording(true)} aria-label="Отправить голосовое"><Send size={18} /></button>
      </div> : <form onSubmit={handleSend} className={styles.composer}>
        {!editingId ? <><label className={styles.composerControl} title="Прикрепить файл"><ImagePlus size={20} /><input type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf,.csv,.zip,.rar,.7z" hidden onChange={handleMediaChange} aria-label="Прикрепить файл" /></label><button type="button" className={styles.composerControl} onClick={shareBankDetails} disabled={sending} title="Поделиться реквизитами" aria-label="Поделиться реквизитами"><Landmark size={19} /></button></> : null}
        <textarea rows={1} placeholder={editingId ? "Изменить сообщение" : "Напишите сообщение…"} aria-label="Сообщение" value={text} onChange={(event) => { setText(event.target.value); event.currentTarget.style.height = "auto"; event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 120)}px`; }} onKeyDown={handleComposerKeyDown} />
        {text.trim() || mediaFile || editingId ? <button type="submit" className={styles.send} disabled={sending || voiceUploading} aria-label={editingId ? "Сохранить сообщение" : "Отправить сообщение"}>{sending ? <Loader2 size={19} className={styles.spinner} /> : editingId ? <Check size={20} /> : <Send size={18} />}</button> : <button type="button" className={styles.send} onClick={startRecording} disabled={voiceUploading} aria-label="Записать голосовое сообщение">{voiceUploading ? <Loader2 size={19} className={styles.spinner} /> : <Mic size={19} />}</button>}
      </form>}
      {!blockedEither && !recording ? <div className={styles.composerNote}><span>Enter — отправить · Shift + Enter — новая строка</span><span>Строва</span></div> : null}
    </div>
  </section>;
}
