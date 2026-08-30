"use client";

import { useAuth } from "@/components/AuthProvider";
import ReportDialog from "@/components/ReportDialog";
import UserBlockButton from "@/components/UserBlockButton";
import { db } from "@/lib/firebase";
import { getApiUrl } from "@/lib/getApiUrl";
import type { Timestamp } from "firebase/firestore";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Edit3,
  FileText,
  ImagePlus,
  Loader2,
  Mic,
  MoreVertical,
  Pause,
  Pin,
  PinOff,
  Play,
  Send,
  Settings,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ChatParticipant = {
  uid?: string;
  displayName?: string;
  name?: string;
  avatarUrl?: string;
  photoURL?: string;
};

type Chat = {
  id: string;
  chatType?: "direct" | "group";
  isGroup?: boolean;
  groupTitle?: string;
  groupAvatarUrl?: string;
  participantIds?: string[];
  participants?: Record<string, ChatParticipant> | string[];
  users?: Record<string, ChatParticipant>;
  listingId?: string;
  listingTitle?: string;
  listingImageUrl?: string;
  listingImage?: string;
  pinnedBy?: string[] | Record<string, boolean> | string | null;
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
  if (Array.isArray(chat.participantIds)) return chat.participantIds;
  if (Array.isArray(chat.participants)) return chat.participants;
  if (chat.users) return Object.keys(chat.users);
  if (chat.participants && !Array.isArray(chat.participants)) {
    return Object.keys(chat.participants);
  }
  return [];
}

function getParticipant(chat: Chat | null, uid: string) {
  if (!chat || !uid) return null;
  const participantMap =
    chat.participants && !Array.isArray(chat.participants)
      ? chat.participants
      : undefined;
  return participantMap?.[uid] || chat.users?.[uid] || null;
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
  if (message.text) return message.text;
  if (message.type === "audio") return "Голосовое сообщение";
  if (message.type === "video") return "Видео";
  if (message.type === "document") return message.fileName || "Файл";
  if (message.type === "image" || message.type === "mixed" || message.imageUrl) {
    return "Фото";
  }
  return "Сообщение";
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

  return (
    <div className="min-w-[220px] py-0.5 sm:min-w-[260px]">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={(event) =>
          setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)
        }
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition duration-200 hover:scale-105 ${
            mine ? "bg-white text-[#0057ff]" : "bg-[#0057ff] text-white"
          }`}
          aria-label={playing ? "Пауза" : "Воспроизвести"}
        >
          {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex h-7 items-end gap-[3px] overflow-hidden">
            {Array.from({ length: 32 }).map((_, index) => {
              const height = 7 + ((index * 13 + 9) % 18);
              const active = index / 31 <= progress / 100;
              return (
                <span
                  key={index}
                  className={`w-[3px] shrink-0 rounded-full transition-colors ${
                    mine
                      ? active
                        ? "bg-white"
                        : "bg-white/35"
                      : active
                      ? "bg-[#0057ff]"
                      : "bg-blue-100"
                  }`}
                  style={{ height }}
                />
              );
            })}
          </div>

          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.05}
            value={Math.min(current, duration || 0)}
            onChange={(event) => {
              const next = Number(event.target.value);
              setCurrent(next);
              if (audioRef.current) audioRef.current.currentTime = next;
            }}
            className="sr-only"
            aria-label="Позиция голосового сообщения"
          />

          <div className={`mt-1 flex items-center justify-between text-[10px] font-black ${mine ? "text-blue-100" : "text-slate-400"}`}>
            <span>{formatDuration(current || duration)}</span>
            <button
              type="button"
              onClick={changeSpeed}
              className={`rounded-full px-2 py-0.5 transition ${mine ? "bg-white/15 text-white hover:bg-white/25" : "bg-blue-50 text-[#0057ff] hover:bg-blue-100"}`}
            >
              {speed}×
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const chatId = String(params.chatId);
  const { user, profile, loading } = useAuth();

  const bottomRef = useRef<HTMLDivElement | null>(null);
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

        setChat(next);
        setPageLoading(false);
      },
      () => {
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

      await Promise.all(
        unread.map((item) => {
          const messageRef = doc(db, "chats", chatId, "messages", item.id);
          const readUpdate = Array.isArray(item.readBy)
            ? { readBy: arrayUnion(user.uid) }
            : { [`readBy.${user.uid}`]: true };
          const deliveredUpdate = Array.isArray(item.deliveredTo)
            ? { deliveredTo: arrayUnion(user.uid) }
            : { [`deliveredTo.${user.uid}`]: true };

          return updateDoc(messageRef, {
            ...readUpdate,
            ...deliveredUpdate,
            updatedAt: serverTimestamp(),
          }).catch(() => undefined);
        })
      );
    });
  }, [chat, chatId, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

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

    const response = await fetch(getApiUrl("/api/chat-upload"), {
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
    const preview = clean
      ? clean
      : type === "audio"
      ? "Голосовое сообщение"
      : type === "video"
      ? "Видео"
      : type === "document"
      ? uploaded?.name || "Файл"
      : "Фото";

    await addDoc(collection(db, "chats", chatId, "messages"), {
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

    await updateDoc(doc(db, "chats", chatId), {
      lastMessageText: preview,
      lastMessageType: type,
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      [`participants.${user.uid}.displayName`]: senderName,
      [`participants.${user.uid}.avatarUrl`]: senderAvatarUrl,
    });

    const recipients = participantIds.filter((uid) => uid !== user.uid);
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
    const pinnedUserIds = getPinnedUserIds(chat.pinnedBy);
    const nextPinnedBy = chatPinned
      ? pinnedUserIds.filter((uid) => uid !== user.uid)
      : Array.from(new Set([...pinnedUserIds, user.uid]));

    await updateDoc(doc(db, "chats", chatId), {
      pinnedBy: nextPinnedBy,
    }).catch(() => setError("Не получилось закрепить чат."));
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
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  if (loading || pageLoading) {
    return (
      <main className="min-h-[calc(100dvh-64px)] bg-[#f4f7ff] px-3 py-5 sm:px-5 sm:py-8 lg:min-h-[calc(100dvh-82px)]">
        <div className="mx-auto max-w-6xl animate-pulse rounded-[24px] bg-white p-5 sm:rounded-[36px] sm:p-8 text-slate-400 shadow-sm">
          Загружаем чат...
        </div>
      </main>
    );
  }

  if (error && !chat) {
    return (
      <main className="min-h-[calc(100dvh-64px)] bg-[#f4f7ff] px-3 py-5 sm:px-5 sm:py-8 lg:min-h-[calc(100dvh-82px)]">
        <div className="empty-card mx-auto max-w-xl">
          <h1>{error}</h1>
          <Link href="/messages" className="btn-primary mt-5">
            К сообщениям
          </Link>
        </div>
      </main>
    );
  }

  const pinnedMessages = messages.filter((item) => item.pinned);
  const lastPinned = pinnedMessages[pinnedMessages.length - 1];
  const listingImage = chat?.listingImageUrl || chat?.listingImage || "";

  return (
    <main className="min-h-[calc(100dvh-64px)] overflow-hidden bg-[#eef3ff] p-0 lg:min-h-[calc(100dvh-82px)] lg:px-5 lg:py-5">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-24 top-32 h-80 w-80 rounded-full bg-blue-300/25 blur-3xl" />
        <div className="absolute -right-28 bottom-10 h-96 w-96 rounded-full bg-indigo-300/20 blur-3xl" />
      </div>

      <div className="chat-shell relative mx-auto flex max-w-6xl flex-col overflow-hidden bg-white/95 shadow-[0_30px_90px_rgba(15,23,42,0.16)] backdrop-blur-xl lg:h-[calc(100dvh-122px)] lg:rounded-[36px] lg:ring-1 lg:ring-white">
        <header className="relative z-30 flex items-center gap-2 overflow-hidden sm:gap-3 bg-gradient-to-r from-[#0057ff] via-[#1266ff] to-[#4c6fff] px-3 py-3 text-white sm:px-5 sm:py-4">
          <div className="absolute -right-16 -top-24 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <Link
            href="/messages"
            className="relative flex h-10 w-10 shrink-0 sm:h-11 sm:w-11 items-center justify-center rounded-2xl bg-white/14 transition duration-200 hover:bg-white/24 hover:scale-105"
            aria-label="Назад"
          >
            <ArrowLeft size={21} />
          </Link>

          <Link
            href={isGroup ? `/messages/${chatId}/info` : otherId ? `/user/${otherId}` : "/messages"}
            className="relative flex min-w-0 flex-1 items-center gap-3"
          >
            <div className="relative flex h-10 w-10 shrink-0 sm:h-12 sm:w-12 items-center justify-center overflow-hidden rounded-[18px] bg-white/18 text-white ring-1 ring-white/25 sm:h-13 sm:w-13">
              {headerAvatar ? (
                <img
                  src={headerAvatar}
                  alt={headerName}
                  className="h-full w-full object-cover"
                />
              ) : isGroup ? (
                <UsersRound size={24} />
              ) : (
                <UserRound size={24} />
              )}
              {!isGroup ? <span className="absolute bottom-1 right-1 h-3 w-3 rounded-full border-2 border-[#1266ff] bg-emerald-400" /> : null}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-black sm:text-lg">{headerName}</h1>
              <p className="truncate text-xs font-bold text-blue-100 sm:text-sm">
                {isGroup ? `${participantIds.length} участников` : chat?.listingTitle || "Личная переписка"}
              </p>
            </div>
          </Link>

          <div className="relative flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={toggleChatPin}
              className={`flex h-9 w-9 items-center sm:h-10 sm:w-10 justify-center rounded-2xl transition duration-200 hover:scale-105 ${
                chatPinned ? "bg-white text-[#0057ff]" : "bg-white/14 text-white hover:bg-white/24"
              }`}
              title={chatPinned ? "Открепить чат" : "Закрепить чат"}
            >
              <Pin size={18} fill={chatPinned ? "currentColor" : "none"} />
            </button>

            {isGroup ? (
              <Link
                href={`/messages/${chatId}/info`}
                className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/14 text-white transition duration-200 hover:scale-105 hover:bg-white/24 sm:h-10 sm:w-10"
                title="Настройки группы"
              >
                <Settings size={18} />
              </Link>
            ) : otherId ? (
              <>
                <ReportDialog
                  targetType="chat"
                  targetId={chatId}
                  targetOwnerId={otherId}
                  targetTitle={`Чат с ${otherName}`}
                  compact
                  buttonClassName="flex h-9 w-9 items-center sm:h-10 sm:w-10 justify-center rounded-2xl bg-white/14 text-white transition duration-200 hover:scale-105 hover:bg-red-500"
                />
                <UserBlockButton
                  targetUserId={otherId}
                  compact
                  onChange={() => {
                    if (!user) return;
                    Promise.all([
                      getDoc(doc(db, "users", user.uid, "blocked", otherId)),
                      getDoc(doc(db, "users", otherId, "blocked", user.uid)),
                    ])
                      .then(([mine, theirs]) =>
                        setBlockedEither(mine.exists() || theirs.exists())
                      )
                      .catch(() => undefined);
                  }}
                />
              </>
            ) : null}
          </div>
        </header>

        {chat?.listingTitle ? (
          <Link
            href={chat.listingId ? `/listing/${chat.listingId}` : "#"}
            className="relative z-20 flex items-center gap-3 border-b border-blue-100 bg-gradient-to-r from-blue-50 to-white px-4 py-2.5 transition hover:bg-blue-50 sm:px-5"
          >
            {listingImage ? (
              <img
                src={listingImage}
                alt=""
                className="h-11 w-11 rounded-xl object-cover ring-1 ring-blue-100"
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-[#0057ff]">
                <ImagePlus size={20} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-slate-950">
                {chat.listingTitle}
              </p>
              <p className="text-xs font-bold text-slate-500">Объявление из Стройка.ру</p>
            </div>
            <span className="text-xs font-black text-[#0057ff]">Открыть →</span>
          </Link>
        ) : null}

        {lastPinned ? (
          <button
            type="button"
            onClick={() => scrollToMessage(lastPinned.id)}
            className="relative z-20 flex items-center gap-3 border-b border-blue-100 bg-white px-4 py-2.5 text-left transition hover:bg-blue-50 sm:px-5"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#0057ff]">
              <Pin size={16} fill="currentColor" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#0057ff]">
                Закреплённое сообщение
              </p>
              <p className="truncate text-sm font-bold text-slate-700">
                {messagePreview(lastPinned)}
              </p>
            </div>
            {pinnedMessages.length > 1 ? (
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-[#0057ff]">
                {pinnedMessages.length}
              </span>
            ) : null}
          </button>
        ) : null}

        <section
          onClick={() => openMenuId && setOpenMenuId("")}
          className="chat-messages relative flex-1 space-y-2 overflow-y-auto bg-[#eef3fb] px-3 py-4 sm:px-6 sm:py-5"
        >
          <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(#b9cdfa_1px,transparent_1px)] [background-size:22px_22px]" />

          {messages.length === 0 ? (
            <div className="relative mx-auto mt-7 max-w-md rounded-[24px] border border-white bg-white/90 p-6 sm:mt-10 sm:rounded-[30px] sm:p-9 text-center shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-blue-50 text-[#0057ff]">
                <Mic size={30} />
              </div>
              <h3 className="mt-5 text-2xl font-black text-slate-950">Начните переписку</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                Отправляйте текст, фотографии, видео и голосовые сообщения.
              </p>
            </div>
          ) : (
            messages.map((message, index) => {
              const isMine = message.senderId === user?.uid;
              const receiptUsers = participantIds.filter((uid) => uid !== user?.uid);
              const isRead = receiptUsers.length > 0
                ? receiptUsers.every((uid) => hasUserMarker(message.readBy, uid))
                : false;
              const isDelivered = receiptUsers.length > 0
                ? receiptUsers.every((uid) => hasUserMarker(message.deliveredTo, uid))
                : false;
              const showDay =
                index === 0 ||
                dayKey(messages[index - 1]?.createdAt) !== dayKey(message.createdAt);
              const imageUrl =
                message.type === "image" || message.type === "mixed"
                  ? message.mediaUrl || message.imageUrl || ""
                  : message.imageUrl || "";
              const videoUrl = message.type === "video" ? message.mediaUrl || "" : "";
              const audioUrl = message.type === "audio" ? message.mediaUrl || "" : "";
              const documentUrl = message.type === "document" ? message.mediaUrl || "" : "";

              return (
                <div key={message.id} className="relative">
                  {showDay ? (
                    <div className="sticky top-2 z-10 my-4 flex justify-center">
                      <span className="rounded-full bg-white/90 px-4 py-1.5 text-[11px] font-black text-slate-500 shadow-sm ring-1 ring-slate-100 backdrop-blur">
                        {formatDay(message.createdAt)}
                      </span>
                    </div>
                  ) : null}

                  <div
                    id={`chat-message-${message.id}`}
                    data-message-id={message.id}
                    className={`message-row group flex ${isMine ? "justify-end" : "justify-start"}`}
                    style={{ animationDelay: `${Math.min(index * 24, 260)}ms` }}
                  >
                    <div className="relative max-w-[88%] sm:max-w-[72%]">
                      <div
                        className={`message-bubble relative overflow-hidden rounded-[24px] px-3.5 py-2.5 shadow-[0_7px_22px_rgba(15,23,42,0.08)] ring-1 transition duration-500 sm:px-4 sm:py-3 ${
                          isMine
                            ? "rounded-br-[7px] bg-gradient-to-br from-[#0057ff] to-[#2f6fff] text-white ring-blue-400/20"
                            : "rounded-bl-[7px] bg-white text-slate-950 ring-slate-100"
                        } ${
                          highlightedId === message.id
                            ? "scale-[1.03] ring-4 ring-amber-300/70"
                            : ""
                        }`}
                      >
                        {message.pinned ? (
                          <div
                            className={`mb-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${
                              isMine
                                ? "bg-white/15 text-white"
                                : "bg-blue-50 text-[#0057ff]"
                            }`}
                          >
                            <Pin size={11} fill="currentColor" /> Закреплено
                          </div>
                        ) : null}

                        {isGroup && !isMine ? (
                          <p className="mb-1.5 text-xs font-black text-[#0057ff]">
                            {message.senderName || getParticipant(chat, message.senderId)?.displayName || getParticipant(chat, message.senderId)?.name || "Участник"}
                          </p>
                        ) : null}

                        {imageUrl ? (
                          <a href={imageUrl} target="_blank" rel="noreferrer">
                            <img
                              src={imageUrl}
                              alt="Фотография в сообщении"
                              className="mb-2 max-h-[440px] w-full min-w-[210px] rounded-[18px] object-cover transition duration-300 hover:scale-[1.01]"
                            />
                          </a>
                        ) : null}

                        {videoUrl ? (
                          <div className="mb-2 min-w-[240px] overflow-hidden rounded-[18px] bg-black/90">
                            <video
                              src={videoUrl}
                              controls
                              playsInline
                              preload="metadata"
                              className="max-h-[420px] w-full"
                            />
                          </div>
                        ) : null}

                        {audioUrl ? <VoiceMessage url={audioUrl} mine={isMine} /> : null}

                        {documentUrl ? (
                          <a
                            href={documentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={`mb-2 flex min-w-[220px] items-center gap-3 rounded-[18px] p-3 ${isMine ? "bg-white/14" : "bg-blue-50"}`}
                          >
                            <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${isMine ? "bg-white/16 text-white" : "bg-white text-[#0057ff]"}`}>
                              <FileText size={21} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-black">{message.fileName || "Документ"}</span>
                              <span className={`mt-1 block text-xs font-bold ${isMine ? "text-blue-100" : "text-slate-500"}`}>Открыть файл</span>
                            </span>
                          </a>
                        ) : null}

                        {message.text ? (
                          <p className="whitespace-pre-wrap break-words text-sm font-medium leading-6 sm:text-[15px]">
                            {message.text}
                          </p>
                        ) : null}

                        <div
                          className={`mt-1.5 flex items-center justify-end gap-1 text-[10px] font-bold ${
                            isMine ? "text-blue-100" : "text-slate-400"
                          }`}
                        >
                          {message.editedAt ? <span>изменено</span> : null}
                          <span>{formatTime(message.createdAt)}</span>
                          {isMine ? (
                            isRead ? (
                              <CheckCheck size={15} className="text-white" />
                            ) : isDelivered ? (
                              <CheckCheck size={15} />
                            ) : (
                              <Check size={15} />
                            )
                          ) : null}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenMenuId(openMenuId === message.id ? "" : message.id);
                        }}
                        className={`absolute top-1 flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 shadow-lg ring-1 ring-slate-100 transition duration-200 hover:scale-105 hover:text-[#0057ff] ${
                          isMine ? "-left-9" : "-right-9"
                        } opacity-100 sm:opacity-0 sm:group-hover:opacity-100`}
                        aria-label="Действия с сообщением"
                      >
                        <MoreVertical size={16} />
                      </button>

                      {openMenuId === message.id ? (
                        <div
                          onClick={(event) => event.stopPropagation()}
                          className={`message-menu absolute z-40 mt-2 w-56 rounded-[22px] bg-white p-2 shadow-[0_22px_65px_rgba(15,23,42,0.22)] ring-1 ring-slate-100 ${
                            isMine ? "right-0" : "left-0"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => togglePin(message)}
                            className="chat-action"
                          >
                            {message.pinned ? <PinOff size={17} /> : <Pin size={17} />}
                            {message.pinned ? "Открепить" : "Закрепить"}
                          </button>

                          {isMine && message.type === "text" ? (
                            <button
                              type="button"
                              onClick={() => beginEdit(message)}
                              className="chat-action"
                            >
                              <Edit3 size={17} /> Изменить
                            </button>
                          ) : null}

                          {!isMine ? (
                            <ReportDialog
                              targetType="message"
                              targetId={message.id}
                              targetOwnerId={message.senderId}
                              targetTitle="Сообщение в чате"
                              targetSnapshot={{
                                chatId,
                                text: message.text || "",
                                imageUrl: imageUrl || "",
                                mediaUrl: message.mediaUrl || "",
                                type: message.type || "text",
                              }}
                              buttonClassName="chat-action text-red-600"
                            />
                          ) : null}

                          <button
                            type="button"
                            onClick={() => hideForMe(message)}
                            className="chat-action"
                          >
                            <Trash2 size={17} /> Удалить у меня
                          </button>

                          {isMine ? (
                            <button
                              type="button"
                              onClick={() => deleteForEveryone(message)}
                              className="chat-action text-red-600"
                            >
                              <Trash2 size={17} /> Удалить у всех
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </section>

        {mediaPreview ? (
          <div className="relative z-20 border-t border-slate-100 bg-white px-3 py-3 sm:px-5">
            <div className="media-preview relative w-fit overflow-hidden rounded-[20px] bg-slate-100 p-1 shadow-sm ring-1 ring-slate-200">
              {mediaKind === "image" ? (
                <img
                  src={mediaPreview}
                  alt="Предпросмотр"
                  className="h-28 w-32 rounded-[16px] object-cover"
                />
              ) : (
                <video
                  src={mediaPreview}
                  muted
                  className="h-28 w-44 rounded-[16px] bg-black object-cover"
                />
              )}
              <button
                type="button"
                onClick={removeMedia}
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white transition hover:scale-105"
                aria-label="Удалить вложение"
              >
                <X size={16} />
              </button>
              <div className="absolute bottom-2 left-2 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-black text-white">
                {mediaKind === "video" ? "Видео" : "Фото"}
              </div>
            </div>
          </div>
        ) : null}

        {mediaFile && mediaKind === "document" ? (
          <div className="relative z-20 border-t border-slate-100 bg-white px-3 py-3 sm:px-5">
            <div className="media-preview flex max-w-md items-center gap-3 rounded-[20px] bg-blue-50 p-3 ring-1 ring-blue-100">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#0057ff] shadow-sm"><FileText size={21} /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-slate-950">{mediaFile.name}</span><span className="mt-1 block text-xs font-bold text-slate-500">Документ · до 25 МБ</span></span>
              <button type="button" onClick={removeMedia} className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-slate-500 transition hover:text-red-600" aria-label="Удалить файл"><X size={17} /></button>
            </div>
          </div>
        ) : null}

        {editingId ? (
          <div className="relative z-20 flex items-center justify-between border-t border-blue-100 bg-blue-50 px-4 py-2.5 text-sm font-black text-[#0057ff] sm:px-5">
            <span className="flex items-center gap-2">
              <Edit3 size={16} /> Редактирование сообщения
            </span>
            <button
              type="button"
              onClick={() => {
                setEditingId("");
                setText("");
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-blue-100"
            >
              <X size={17} />
            </button>
          </div>
        ) : null}

        {error ? (
          <div className="relative z-20 flex items-center justify-between border-t border-red-100 bg-red-50 px-4 py-2 text-sm font-black text-red-600 sm:px-5">
            <span>{error}</span>
            <button type="button" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        ) : null}

        <div className="relative z-20 border-t border-slate-100 bg-white/95 p-3 backdrop-blur-xl sm:p-4">
          {blockedEither ? (
            <div className="rounded-[22px] border border-red-100 bg-red-50 px-4 py-4 text-center text-sm font-black text-red-600">
              Отправка сообщений заблокирована
            </div>
          ) : recording ? (
            <div className="recording-panel flex items-center gap-3 rounded-[24px] border border-red-100 bg-red-50 p-2.5 shadow-inner sm:px-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-200">
                <Mic size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                  <span className="text-sm font-black text-red-600">Идёт запись</span>
                  <span className="text-sm font-black tabular-nums text-slate-700">
                    {formatDuration(recordSeconds)}
                  </span>
                </div>
                <div className="mt-2 flex h-5 items-end gap-1 overflow-hidden">
                  {Array.from({ length: 30 }).map((_, index) => (
                    <span
                      key={index}
                      className="recording-bar w-1 rounded-full bg-red-400"
                      style={{
                        height: 5 + ((index * 11 + 7) % 15),
                        animationDelay: `${index * 35}ms`,
                      }}
                    />
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => stopRecording(false)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm transition hover:text-red-600"
                title="Отменить"
              >
                <X size={20} />
              </button>
              <button
                type="button"
                onClick={() => stopRecording(true)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0057ff] text-white shadow-lg shadow-blue-200 transition hover:scale-105"
                title="Отправить голосовое"
              >
                <Send size={19} />
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSend}
              className="flex items-end gap-2 rounded-[24px] border border-slate-200 bg-slate-50/80 p-2 transition duration-300 focus-within:border-blue-300 focus-within:bg-white focus-within:shadow-[0_0_0_5px_rgba(0,87,255,0.07)]"
            >
              {!editingId ? (
                <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-white text-[#0057ff] shadow-sm ring-1 ring-slate-100 transition hover:scale-105 hover:bg-blue-50">
                  <ImagePlus size={21} />
                  <input
                    type="file"
                    accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf,.csv,.zip,.rar,.7z"
                    className="hidden"
                    onChange={handleMediaChange}
                  />
                </label>
              ) : null}

              <textarea
                className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm font-semibold leading-6 text-slate-950 outline-none placeholder:text-slate-400 sm:text-[15px]"
                rows={1}
                placeholder={editingId ? "Изменить сообщение" : "Сообщение"}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={handleComposerKeyDown}
              />

              {text.trim() || mediaFile || editingId ? (
                <button
                  disabled={sending || voiceUploading}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0057ff] text-white shadow-lg shadow-blue-200 transition hover:scale-105 disabled:cursor-wait disabled:opacity-60"
                  title={editingId ? "Сохранить" : "Отправить"}
                >
                  {sending ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : editingId ? (
                    <Check size={21} />
                  ) : (
                    <Send size={20} />
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={voiceUploading}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0057ff] text-white shadow-lg shadow-blue-200 transition hover:scale-105 disabled:opacity-60"
                  title="Записать голосовое"
                >
                  {voiceUploading ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <Mic size={21} />
                  )}
                </button>
              )}
            </form>
          )}
        </div>
      </div>

      <style jsx>{`
        .chat-shell {
          animation: shellIn 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .message-row {
          animation: messageIn 360ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .message-menu {
          animation: menuIn 170ms cubic-bezier(0.22, 1, 0.36, 1) both;
          transform-origin: top right;
        }
        .media-preview {
          animation: previewIn 240ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .recording-panel {
          animation: previewIn 220ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .recording-bar {
          animation: recordingWave 700ms ease-in-out infinite alternate;
        }
        .chat-messages {
          scroll-behavior: smooth;
          scrollbar-width: thin;
          scrollbar-color: #bfd0f5 transparent;
        }
        .chat-messages::-webkit-scrollbar {
          width: 7px;
        }
        .chat-messages::-webkit-scrollbar-thumb {
          border-radius: 999px;
          background: #bfd0f5;
        }
        @keyframes shellIn {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.992);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes messageIn {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes menuIn {
          from {
            opacity: 0;
            transform: translateY(-5px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes previewIn {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes recordingWave {
          from {
            transform: scaleY(0.45);
            opacity: 0.55;
          }
          to {
            transform: scaleY(1);
            opacity: 1;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .chat-shell,
          .message-row,
          .message-menu,
          .media-preview,
          .recording-panel,
          .recording-bar {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}
