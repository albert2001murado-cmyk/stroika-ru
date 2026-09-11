"use client";

import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import type { Timestamp } from "firebase/firestore";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import {
  ArrowLeft,
  Camera,
  Copy,
  Crown,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  LogOut,
  Mic2,
  Pin,
  RefreshCcw,
  Save,
  Settings2,
  Share2,
  ShieldCheck,
  Tag,
  UserMinus,
  UserRound,
  UsersRound,
  Video,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Participant = {
  uid?: string;
  name?: string;
  displayName?: string;
  photoURL?: string;
  avatarUrl?: string;
};

type AdminPermission = "editInfo" | "inviteMembers" | "kickMembers" | "manageTags";
type AdminPermissionSet = Record<AdminPermission, boolean>;

type GroupChat = {
  id: string;
  chatType?: string;
  isGroup?: boolean;
  groupTitle?: string;
  groupAvatarUrl?: string;
  groupAvatarPath?: string;
  ownerId?: string;
  adminIds?: string[];
  adminPermissions?: Record<string, Partial<AdminPermissionSet>>;
  memberTags?: Record<string, string>;
  participantIds?: string[];
  participants?: Record<string, Participant> | string[];
  users?: Record<string, Participant> | string[];
  inviteToken?: string;
};

type Message = {
  id: string;
  senderId?: string;
  senderName?: string;
  text?: string;
  type?: string;
  mediaUrl?: string;
  imageUrl?: string;
  fileName?: string;
  pinned?: boolean;
  createdAt?: Timestamp;
};

type TabId = "members" | "media" | "voice" | "files" | "links";

const FULL_PERMISSIONS: AdminPermissionSet = {
  editInfo: true,
  inviteMembers: true,
  kickMembers: true,
  manageTags: true,
};

const PERMISSION_ROWS: Array<{
  id: AdminPermission;
  title: string;
  text: string;
}> = [
  { id: "editInfo", title: "Название и аватар", text: "Менять оформление группы" },
  { id: "inviteMembers", title: "Приглашения", text: "Отправлять и обновлять ссылку" },
  { id: "kickMembers", title: "Участники", text: "Удалять обычных участников" },
  { id: "manageTags", title: "Теги", text: "Назначать подписи рядом с именами" },
];

const URL_RE = /https?:\/\/[^\s<>()]+/gi;

function getParticipantIds(chat: GroupChat | null) {
  if (!chat) return [];
  const ids = new Set<string>();
  (chat.participantIds || []).forEach((uid) => uid && ids.add(uid));
  if (Array.isArray(chat.participants)) {
    chat.participants.forEach((uid) => uid && ids.add(uid));
  } else if (chat.participants) {
    Object.keys(chat.participants).forEach((uid) => ids.add(uid));
  }
  if (Array.isArray(chat.users)) {
    chat.users.forEach((uid) => uid && ids.add(uid));
  } else if (chat.users) {
    Object.keys(chat.users).forEach((uid) => ids.add(uid));
  }
  if (chat.ownerId) ids.add(chat.ownerId);
  return [...ids];
}

function participant(chat: GroupChat | null, uid: string): Participant {
  if (!chat) return {};
  const participantMap = !Array.isArray(chat.participants) ? chat.participants : undefined;
  const usersMap = !Array.isArray(chat.users) ? chat.users : undefined;
  return participantMap?.[uid] || usersMap?.[uid] || {};
}

function permissionsFor(chat: GroupChat | null, uid: string): AdminPermissionSet {
  const none: AdminPermissionSet = {
    editInfo: false,
    inviteMembers: false,
    kickMembers: false,
    manageTags: false,
  };
  if (!chat || !uid) return none;
  if (chat.ownerId === uid) return { ...FULL_PERMISSIONS };
  if (!chat.adminIds?.includes(uid)) return none;
  const saved = chat.adminPermissions?.[uid];
  if (!saved) return { ...FULL_PERMISSIONS };
  return {
    editInfo: saved.editInfo === true,
    inviteMembers: saved.inviteMembers === true,
    kickMembers: saved.kickMembers === true,
    manageTags: saved.manageTags === true,
  };
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

function timeText(value?: Timestamp) {
  const ms = value?.toMillis?.() || 0;
  if (!ms) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

function roleLabel(chat: GroupChat, uid: string) {
  if (uid === chat.ownerId) return "Владелец";
  if (chat.adminIds?.includes(uid)) return "Администратор";
  return "Участник";
}

function ResourceEmpty({ title }: { title: string }) {
  return (
    <div className="rounded-[26px] border border-dashed border-blue-200 bg-blue-50/60 px-5 py-12 text-center">
      <Pin className="mx-auto text-[#0057ff]" size={30} />
      <p className="mt-4 text-lg font-black text-slate-900">{title}</p>
      <p className="mt-1 text-sm font-semibold text-slate-500">
        Всё появится здесь автоматически.
      </p>
    </div>
  );
}

export default function GroupInfoPage() {
  const params = useParams<{ chatId: string }>();
  const router = useRouter();
  const chatId = String(params.chatId || "");
  const { user, loading: authLoading } = useAuth();
  const titleDirtyRef = useRef(false);

  const [chat, setChat] = useState<GroupChat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [title, setTitle] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [tab, setTab] = useState<TabId>("members");
  const [busy, setBusy] = useState(false);
  const [selectedUid, setSelectedUid] = useState("");
  const [memberTag, setMemberTag] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/auth");
      return;
    }

    const unsubscribeChat = onSnapshot(
      doc(db, "chats", chatId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setError("Группа не найдена.");
          setLoading(false);
          return;
        }
        const next = { id: snapshot.id, ...snapshot.data() } as GroupChat;
        if (next.chatType !== "group" && next.isGroup !== true) {
          setError("Этот чат не является группой.");
          setLoading(false);
          return;
        }
        if (!getParticipantIds(next).includes(user.uid)) {
          setError("Вы больше не состоите в этой группе.");
          setLoading(false);
          return;
        }
        setChat(next);
        if (!titleDirtyRef.current) {
          setTitle(next.groupTitle?.trim() || "Групповой чат");
        }
        setError("");
        setLoading(false);
      },
      (snapshotError) => {
        console.error("[group-info] chat subscription failed", snapshotError);
        setError("Не получилось загрузить настройки группы.");
        setLoading(false);
      }
    );

    const unsubscribeMessages = onSnapshot(
      query(
        collection(db, "chats", chatId, "messages"),
        orderBy("createdAt", "asc")
      ),
      (snapshot) => {
        setMessages(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })) as Message[]
        );
      },
      () => setMessages([])
    );

    return () => {
      unsubscribeChat();
      unsubscribeMessages();
    };
  }, [authLoading, chatId, router, user]);

  useEffect(() => {
    return () => {
      if (avatarPreview.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 2800);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const ids = useMemo(() => getParticipantIds(chat), [chat]);
  const isOwner = Boolean(user && chat?.ownerId === user.uid);
  const myPermissions = permissionsFor(chat, user?.uid || "");
  const origin = typeof window === "undefined" ? "https://stroika-ru.ru" : window.location.origin;
  const inviteLink = chat?.inviteToken ? `${origin}/join/${chat.inviteToken}` : "";

  const media = useMemo(
    () =>
      messages.filter(
        (item) =>
          ["image", "video", "mixed"].includes(item.type || "") ||
          Boolean(item.imageUrl)
      ),
    [messages]
  );
  const voices = useMemo(
    () => messages.filter((item) => item.type === "audio"),
    [messages]
  );
  const files = useMemo(
    () => messages.filter((item) => item.type === "document"),
    [messages]
  );
  const links = useMemo(
    () =>
      messages.flatMap((message) =>
        (message.text?.match(URL_RE) || []).map((url) => ({ message, url }))
      ),
    [messages]
  );

  const tabs = [
    { id: "members" as const, label: "Участники", count: ids.length, icon: UsersRound },
    { id: "media" as const, label: "Медиа", count: media.length, icon: ImageIcon },
    { id: "voice" as const, label: "Голосовые", count: voices.length, icon: Mic2 },
    { id: "files" as const, label: "Файлы", count: files.length, icon: FileText },
    { id: "links" as const, label: "Ссылки", count: links.length, icon: Link2 },
  ];

  const selectedMember = participant(chat, selectedUid);
  const selectedName =
    selectedMember.displayName || selectedMember.name || "Пользователь";
  const selectedIsAdmin = Boolean(chat?.adminIds?.includes(selectedUid));
  const selectedPermissions = permissionsFor(chat, selectedUid);
  const canKickSelected = Boolean(
    user &&
      chat &&
      selectedUid &&
      selectedUid !== user.uid &&
      selectedUid !== chat.ownerId &&
      myPermissions.kickMembers &&
      (isOwner || !chat.adminIds?.includes(selectedUid))
  );

  function memberName(uid: string) {
    const item = participant(chat, uid);
    return item.displayName || item.name || "Пользователь";
  }

  function canOpenMemberSettings(uid: string) {
    if (!user || !chat) return false;
    if (isOwner && uid !== chat.ownerId) return true;
    if (myPermissions.manageTags) return true;
    return (
      myPermissions.kickMembers &&
      uid !== user.uid &&
      uid !== chat.ownerId &&
      !chat.adminIds?.includes(uid)
    );
  }

  function openMemberSettings(uid: string) {
    if (!canOpenMemberSettings(uid)) return;
    setSelectedUid(uid);
    setMemberTag(chat?.memberTags?.[uid] || "");
    setError("");
  }

  async function apiAction(action: string, payload: Record<string, unknown> = {}) {
    if (!user) throw new Error("Нужно войти в аккаунт.");
    const token = await user.getIdToken();
    const response = await fetch("/api/groups/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ chatId, action, ...payload }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || "Не получилось сохранить изменения.");
    }
    return result as { inviteToken?: string };
  }

  async function uploadAvatar(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/chat-upload", {
      method: "POST",
      body: formData,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.type !== "image" || !result.url) {
      throw new Error(result.error || "Не получилось загрузить аватар.");
    }
    return result as { url: string; path?: string };
  }

  function pickAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Для аватара выберите изображение.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Изображение должно быть не больше 10 МБ.");
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setError("");
  }

  async function saveGroup() {
    if (!chat || !myPermissions.editInfo || busy) return;
    const cleanTitle = title.replace(/\s+/g, " ").trim();
    if (cleanTitle.length < 2) {
      setError("Введите название группы — минимум 2 символа.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const uploaded = avatarFile ? await uploadAvatar(avatarFile) : null;
      await apiAction("update", {
        title: cleanTitle,
        avatarUrl: uploaded?.url || chat.groupAvatarUrl || "",
        avatarPath: uploaded?.path || chat.groupAvatarPath || "",
      });
      titleDirtyRef.current = false;
      setAvatarFile(null);
      setAvatarPreview("");
      setNotice("Оформление группы сохранено");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не получилось сохранить группу.");
    } finally {
      setBusy(false);
    }
  }

  async function shareInvite() {
    if (!inviteLink || !myPermissions.inviteMembers) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: chat?.groupTitle || "Групповой чат",
          text: `Присоединяйтесь к группе «${chat?.groupTitle || "Стройка.ру"}»`,
          url: inviteLink,
        });
      } else {
        await navigator.clipboard.writeText(inviteLink);
        setNotice("Ссылка скопирована");
      }
    } catch (shareError) {
      if ((shareError as Error)?.name !== "AbortError") {
        setError("Не получилось поделиться ссылкой.");
      }
    }
  }

  async function copyInvite() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setNotice("Ссылка скопирована");
    } catch {
      setError("Не получилось скопировать ссылку.");
    }
  }

  async function renewInvite() {
    if (!myPermissions.inviteMembers || busy) return;
    setBusy(true);
    setError("");
    try {
      await apiAction("new-invite");
      setNotice("Новая ссылка создана");
    } catch (renewError) {
      setError(renewError instanceof Error ? renewError.message : "Не получилось обновить ссылку.");
    } finally {
      setBusy(false);
    }
  }

  async function updateAdmin(enabled: boolean) {
    if (!selectedUid || !isOwner || busy) return;
    setBusy(true);
    setError("");
    try {
      await apiAction("set-admin", {
        targetUid: selectedUid,
        enabled,
        permissions: FULL_PERMISSIONS,
      });
      setNotice(enabled ? "Участник назначен администратором" : "Роль администратора снята");
    } catch (roleError) {
      setError(roleError instanceof Error ? roleError.message : "Не получилось изменить роль.");
    } finally {
      setBusy(false);
    }
  }

  async function updatePermission(permission: AdminPermission, enabled: boolean) {
    if (!selectedUid || !isOwner || busy) return;
    setBusy(true);
    setError("");
    try {
      await apiAction("set-admin-permissions", {
        targetUid: selectedUid,
        permissions: { ...selectedPermissions, [permission]: enabled },
      });
      setNotice("Права администратора обновлены");
    } catch (permissionError) {
      setError(
        permissionError instanceof Error
          ? permissionError.message
          : "Не получилось изменить доступ."
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveMemberTag() {
    if (!selectedUid || !myPermissions.manageTags || busy) return;
    setBusy(true);
    setError("");
    try {
      await apiAction("set-tag", {
        targetUid: selectedUid,
        tag: memberTag.replace(/\s+/g, " ").trim().slice(0, 24),
      });
      setNotice("Тег участника сохранён");
    } catch (tagError) {
      setError(tagError instanceof Error ? tagError.message : "Не получилось сохранить тег.");
    } finally {
      setBusy(false);
    }
  }

  async function kickMember() {
    if (!selectedUid || !canKickSelected || busy) return;
    if (!window.confirm(`Удалить «${memberName(selectedUid)}» из группы?`)) return;
    setBusy(true);
    setError("");
    try {
      await apiAction("kick", { targetUid: selectedUid });
      setSelectedUid("");
      setNotice("Участник удалён из группы");
    } catch (kickError) {
      setError(kickError instanceof Error ? kickError.message : "Не получилось удалить участника.");
    } finally {
      setBusy(false);
    }
  }

  async function leaveGroup() {
    if (!user || busy) return;
    const text = isOwner
      ? "После выхода владельцем станет администратор или следующий участник. Выйти?"
      : "Выйти из этой группы?";
    if (!window.confirm(text)) return;
    setBusy(true);
    setError("");
    try {
      await apiAction("leave");
      router.replace("/messages");
    } catch (leaveError) {
      setError(leaveError instanceof Error ? leaveError.message : "Не получилось выйти из группы.");
      setBusy(false);
    }
  }

  if (authLoading || loading) {
    return (
      <main className="min-h-screen bg-[#f3f6ff] px-4 py-10">
        <div className="mx-auto flex max-w-4xl items-center justify-center rounded-[34px] bg-white p-12 text-[#0057ff] shadow-sm">
          <Loader2 className="animate-spin" size={34} />
          <span className="ml-3 font-black">Загружаем группу...</span>
        </div>
      </main>
    );
  }

  if (!chat || error && !getParticipantIds(chat).includes(user?.uid || "")) {
    return (
      <main className="min-h-screen bg-[#f3f6ff] px-4 py-10">
        <div className="mx-auto max-w-xl rounded-[34px] border border-blue-100 bg-white p-8 text-center shadow-[0_24px_70px_rgba(15,23,42,0.10)]">
          <UsersRound className="mx-auto text-[#0057ff]" size={44} />
          <h1 className="mt-5 text-2xl font-black text-slate-950">Не получилось открыть группу</h1>
          <p className="mt-2 font-semibold text-slate-500">{error || "Группа не найдена."}</p>
          <Link href="/messages" className="btn-primary mt-6 inline-flex">К сообщениям</Link>
        </div>
      </main>
    );
  }

  const shownAvatar = avatarPreview || chat.groupAvatarUrl || "";

  return (
    <main className="min-h-screen overflow-hidden bg-[#f3f6ff] px-3 py-4 sm:px-6 sm:py-8">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 top-40 h-96 w-96 rounded-full bg-blue-200/35 blur-3xl" />
        <div className="absolute -right-32 bottom-0 h-[28rem] w-[28rem] rounded-full bg-indigo-200/30 blur-3xl" />
      </div>

      <div className="group-info-shell relative mx-auto max-w-6xl">
        <section className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-[#0057ff] via-[#1266ff] to-[#4c6fff] px-4 pb-20 pt-4 text-white shadow-[0_28px_80px_rgba(0,87,255,0.24)] sm:rounded-[42px] sm:px-8 sm:pb-24 sm:pt-6">
          <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full bg-white/12 blur-2xl" />
          <div className="relative flex items-center justify-between">
            <Link
              href={`/messages/${chatId}`}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/14 ring-1 ring-white/20 transition duration-200 hover:scale-105 hover:bg-white/24"
              aria-label="Вернуться в чат"
            >
              <ArrowLeft size={21} />
            </Link>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/14 px-3 py-2 text-[11px] font-black uppercase tracking-[0.13em] ring-1 ring-white/20">
              <ShieldCheck size={15} /> Рабочая группа
            </span>
          </div>

          <div className="relative mt-5 flex flex-col items-center text-center">
            <div className="relative">
              <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-[34px] border-4 border-white bg-blue-50 text-[#0057ff] shadow-[0_18px_42px_rgba(3,37,120,0.28)] sm:h-32 sm:w-32 sm:rounded-[38px]">
                {shownAvatar ? (
                  <img src={shownAvatar} alt={chat.groupTitle || "Группа"} className="h-full w-full object-cover" />
                ) : (
                  <UsersRound size={46} />
                )}
              </div>
              {myPermissions.editInfo ? (
                <label
                  htmlFor="group-avatar-file"
                  className="absolute -bottom-1 -right-1 flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl border-2 border-white bg-[#0057ff] text-white shadow-lg transition duration-200 hover:scale-105 hover:bg-blue-700"
                  title="Сменить аватар"
                >
                  <Camera size={19} />
                  <input id="group-avatar-file" type="file" accept="image/*" className="sr-only" onChange={pickAvatar} />
                </label>
              ) : null}
            </div>
            <h1 className="mt-5 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">
              {chat.groupTitle || "Групповой чат"}
            </h1>
            <span className="member-count-pill mt-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/14 px-4 py-2 text-sm font-black backdrop-blur">
              <UsersRound size={17} /> {memberCountLabel(ids.length)}
            </span>
          </div>
        </section>

        <section className="relative -mt-14 grid gap-4 px-2 sm:-mt-16 sm:px-5 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[28px] border border-white/90 bg-white/95 p-5 shadow-[0_24px_65px_rgba(15,23,42,0.11)] backdrop-blur sm:rounded-[34px] sm:p-7">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#0057ff]">
                <Settings2 size={21} />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-950">Оформление группы</h2>
                <p className="text-xs font-bold text-slate-500">Название и аватар видят все участники</p>
              </div>
            </div>
            <label className="mt-5 block text-xs font-black uppercase tracking-[0.11em] text-slate-500">
              Название группы
            </label>
            <input
              value={title}
              disabled={!myPermissions.editInfo || busy}
              maxLength={80}
              onChange={(event) => {
                titleDirtyRef.current = true;
                setTitle(event.target.value);
              }}
              className="mt-2 h-14 w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 text-base font-black text-slate-950 outline-none transition focus:border-blue-300 focus:bg-white focus:shadow-[0_0_0_5px_rgba(0,87,255,0.08)] disabled:cursor-not-allowed disabled:opacity-60"
            />
            {myPermissions.editInfo ? (
              <button
                type="button"
                onClick={saveGroup}
                disabled={busy || title.trim().length < 2}
                className="mt-3 flex h-13 w-full items-center justify-center gap-2 rounded-[19px] bg-[#0057ff] px-5 font-black text-white shadow-lg shadow-blue-200 transition duration-200 hover:-translate-y-0.5 hover:bg-blue-700 disabled:translate-y-0 disabled:opacity-55"
              >
                {busy ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                Сохранить оформление
              </button>
            ) : (
              <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-500">
                Изменять оформление может владелец или администратор с доступом.
              </p>
            )}
          </div>

          <div className="rounded-[28px] border border-white/90 bg-white/95 p-5 shadow-[0_24px_65px_rgba(15,23,42,0.11)] backdrop-blur sm:rounded-[34px] sm:p-7">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#0057ff]">
                <Link2 size={21} />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-950">Приглашение по ссылке</h2>
                <p className="text-xs font-bold text-slate-500">Доступ только у тех, кому отправили ссылку</p>
              </div>
            </div>
            <div className="mt-5 flex min-h-14 items-center gap-2 rounded-[20px] border border-blue-100 bg-blue-50/70 px-4">
              <p className="min-w-0 flex-1 truncate text-sm font-extrabold text-slate-600">
                {myPermissions.inviteMembers ? inviteLink || "Создайте новую ссылку" : "Ссылка доступна администратору"}
              </p>
              {inviteLink && myPermissions.inviteMembers ? (
                <button type="button" onClick={copyInvite} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#0057ff] transition hover:scale-105" title="Копировать">
                  <Copy size={17} />
                </button>
              ) : null}
            </div>
            {myPermissions.inviteMembers ? (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button type="button" onClick={shareInvite} disabled={!inviteLink || busy} className="flex h-13 items-center justify-center gap-2 rounded-[18px] bg-[#0057ff] px-4 font-black text-white transition hover:bg-blue-700 disabled:opacity-50">
                  <Share2 size={18} /> Поделиться
                </button>
                <button type="button" onClick={renewInvite} disabled={busy} className="flex h-13 items-center justify-center gap-2 rounded-[18px] border border-blue-200 bg-white px-4 font-black text-[#0057ff] transition hover:bg-blue-50 disabled:opacity-50">
                  <RefreshCcw size={17} /> Обновить ссылку
                </button>
              </div>
            ) : null}
          </div>
        </section>

        {error ? (
          <div className="mx-2 mt-4 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 sm:mx-5">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="notice-pop mx-2 mt-4 flex items-center gap-2 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700 sm:mx-5">
            <ShieldCheck size={17} /> {notice}
          </div>
        ) : null}

        <nav className="mt-5 flex gap-2 overflow-x-auto px-2 pb-2 sm:px-5" aria-label="Разделы группы">
          {tabs.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex h-12 shrink-0 items-center gap-2 rounded-[18px] border px-4 text-sm font-black transition duration-200 ${
                  active
                    ? "border-[#0057ff] bg-[#0057ff] text-white shadow-lg shadow-blue-200"
                    : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50"
                }`}
              >
                <Icon size={17} />
                {item.label}
                <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[10px] ${active ? "bg-white/18 text-white" : "bg-blue-50 text-[#0057ff]"}`}>
                  {item.count}
                </span>
              </button>
            );
          })}
        </nav>

        <section className="mx-2 mt-2 rounded-[28px] border border-white/90 bg-white/95 p-3 shadow-[0_24px_65px_rgba(15,23,42,0.09)] backdrop-blur sm:mx-5 sm:rounded-[34px] sm:p-5">
          {tab === "members" ? (
            <div className="space-y-2">
              {ids.map((uid, index) => {
                const item = participant(chat, uid);
                const name = item.displayName || item.name || "Пользователь";
                const photo = item.avatarUrl || item.photoURL || "";
                const tag = chat.memberTags?.[uid] || "";
                return (
                  <div
                    key={uid}
                    className="member-row flex items-center gap-3 rounded-[22px] border border-slate-100 bg-white p-3 transition duration-200 hover:border-blue-200 hover:bg-blue-50/35"
                    style={{ animationDelay: `${Math.min(index * 35, 280)}ms` }}
                  >
                    <Link href={`/user/${uid}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-13 w-13 shrink-0 items-center justify-center overflow-hidden rounded-[18px] bg-blue-50 text-[#0057ff] ring-1 ring-blue-100">
                        {photo ? <img src={photo} alt={name} className="h-full w-full object-cover" /> : <UserRound size={23} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-black text-slate-950">{name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className={`text-xs font-bold ${uid === chat.ownerId || chat.adminIds?.includes(uid) ? "text-[#0057ff]" : "text-slate-500"}`}>
                            {roleLabel(chat, uid)}
                          </span>
                          {tag ? (
                            <span className="max-w-44 truncate rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-[#0057ff]">
                              {tag}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                    {canOpenMemberSettings(uid) ? (
                      <button type="button" onClick={() => openMemberSettings(uid)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#0057ff] transition hover:scale-105 hover:bg-blue-100" title="Настройки участника">
                        <Settings2 size={19} />
                      </button>
                    ) : uid === chat.ownerId ? (
                      <Crown className="shrink-0 text-[#0057ff]" size={20} />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {tab === "media" ? (
            media.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {media.map((item) => {
                  const url = item.mediaUrl || item.imageUrl || "";
                  return (
                    <a key={item.id} href={url || undefined} target="_blank" rel="noreferrer" className="group relative aspect-square overflow-hidden rounded-[22px] bg-blue-50 ring-1 ring-blue-100">
                      {url ? <img src={url} alt="Вложение" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : null}
                      {item.type === "video" ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-slate-950/20 text-white"><Video size={30} /></span>
                      ) : null}
                      <span className="absolute inset-x-2 bottom-2 truncate rounded-xl bg-slate-950/55 px-2 py-1 text-[10px] font-black text-white backdrop-blur">
                        {item.senderName || "Участник"}
                      </span>
                    </a>
                  );
                })}
              </div>
            ) : <ResourceEmpty title="Медиа пока нет" />
          ) : null}

          {tab === "voice" ? (
            voices.length ? (
              <div className="space-y-2">
                {voices.map((item) => (
                  <a key={item.id} href={item.mediaUrl || undefined} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-[20px] border border-slate-100 p-3 transition hover:border-blue-200 hover:bg-blue-50/40">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#0057ff]"><Mic2 size={20} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-black text-slate-900">{item.senderName || "Голосовое сообщение"}</span><span className="text-xs font-semibold text-slate-500">{timeText(item.createdAt)}</span></span>
                  </a>
                ))}
              </div>
            ) : <ResourceEmpty title="Голосовых пока нет" />
          ) : null}

          {tab === "files" ? (
            files.length ? (
              <div className="space-y-2">
                {files.map((item) => (
                  <a key={item.id} href={item.mediaUrl || undefined} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-[20px] border border-slate-100 p-3 transition hover:border-blue-200 hover:bg-blue-50/40">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#0057ff]"><FileText size={20} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-black text-slate-900">{item.fileName || "Документ"}</span><span className="text-xs font-semibold text-slate-500">{item.senderName || "Участник"}</span></span>
                  </a>
                ))}
              </div>
            ) : <ResourceEmpty title="Файлов пока нет" />
          ) : null}

          {tab === "links" ? (
            links.length ? (
              <div className="space-y-2">
                {links.map(({ message, url }, index) => (
                  <a key={`${message.id}-${index}`} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-[20px] border border-slate-100 p-3 transition hover:border-blue-200 hover:bg-blue-50/40">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#0057ff]"><Link2 size={20} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-black text-[#0057ff]">{url}</span><span className="text-xs font-semibold text-slate-500">{message.senderName || "Участник"}</span></span>
                  </a>
                ))}
              </div>
            ) : <ResourceEmpty title="Ссылок пока нет" />
          ) : null}
        </section>

        <button type="button" onClick={leaveGroup} disabled={busy} className="mx-auto mb-12 mt-5 flex h-13 items-center justify-center gap-2 rounded-[19px] border border-red-200 bg-red-50 px-7 font-black text-red-600 transition hover:bg-red-100 disabled:opacity-50">
          <LogOut size={19} /> Выйти из группы
        </button>
      </div>

      {selectedUid ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/58 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={(event) => event.target === event.currentTarget && setSelectedUid("")}>
          <section className="member-sheet max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-[34px] bg-white p-4 shadow-[0_30px_90px_rgba(2,8,23,0.34)] sm:rounded-[34px] sm:p-6">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-2xl font-black text-slate-950">{selectedName}</h2>
                <p className="text-sm font-bold text-slate-500">Настройки участника</p>
              </div>
              <button type="button" onClick={() => setSelectedUid("")} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 transition hover:scale-105 hover:bg-slate-200" aria-label="Закрыть">
                <X size={21} />
              </button>
            </div>

            {isOwner && selectedUid !== chat.ownerId ? (
              <div className="mt-5 flex items-center gap-3 rounded-[22px] bg-blue-50 p-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#0057ff]"><Crown size={21} /></span>
                <div className="min-w-0 flex-1"><p className="font-black text-slate-950">Администратор</p><p className="text-xs font-semibold text-slate-500">Владелец выбирает доступы ниже</p></div>
                <input type="checkbox" checked={selectedIsAdmin} disabled={busy} onChange={(event) => updateAdmin(event.target.checked)} className="h-6 w-6 accent-[#0057ff]" />
              </div>
            ) : null}

            {isOwner && selectedIsAdmin && selectedUid !== chat.ownerId ? (
              <div className="mt-4 rounded-[22px] border border-slate-200 p-4">
                <h3 className="font-black text-slate-950">Доступы администратора</h3>
                <div className="mt-2 divide-y divide-slate-100">
                  {PERMISSION_ROWS.map((row) => (
                    <label key={row.id} className="flex items-center gap-3 py-3">
                      <span className="min-w-0 flex-1"><span className="block text-sm font-black text-slate-900">{row.title}</span><span className="block text-xs font-semibold text-slate-500">{row.text}</span></span>
                      <input type="checkbox" checked={selectedPermissions[row.id]} disabled={busy} onChange={(event) => updatePermission(row.id, event.target.checked)} className="h-6 w-6 accent-[#0057ff]" />
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {myPermissions.manageTags ? (
              <div className="mt-4 rounded-[22px] border border-slate-200 p-4">
                <div className="flex items-center gap-2"><Tag className="text-[#0057ff]" size={19} /><h3 className="font-black text-slate-950">Тег рядом с именем</h3></div>
                <input value={memberTag} onChange={(event) => setMemberTag(event.target.value)} maxLength={24} placeholder="Например: Прораб" className="mt-3 h-13 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 font-bold text-slate-950 outline-none transition focus:border-blue-300 focus:bg-white focus:shadow-[0_0_0_5px_rgba(0,87,255,0.08)]" />
                <p className="mt-2 text-xs font-semibold text-slate-500">До 24 символов. Пустое поле удалит тег.</p>
                <button type="button" onClick={saveMemberTag} disabled={busy} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[17px] bg-[#0057ff] font-black text-white transition hover:bg-blue-700 disabled:opacity-50">
                  {busy ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />} Сохранить тег
                </button>
              </div>
            ) : null}

            {canKickSelected ? (
              <button type="button" onClick={kickMember} disabled={busy} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-[17px] border border-red-200 bg-red-50 font-black text-red-600 transition hover:bg-red-100 disabled:opacity-50">
                <UserMinus size={18} /> Удалить из группы
              </button>
            ) : null}
          </section>
        </div>
      ) : null}

      <style jsx>{`
        .group-info-shell { animation: groupShellIn 520ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .member-count-pill { animation: memberCountIn 300ms 100ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .member-row { animation: memberRowIn 360ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .member-sheet { animation: memberSheetIn 260ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .notice-pop { animation: noticeIn 220ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        @keyframes groupShellIn { from { opacity: 0; transform: translateY(16px) scale(0.994); } to { opacity: 1; transform: none; } }
        @keyframes memberCountIn { from { opacity: 0; transform: translateY(5px) scale(0.94); } to { opacity: 1; transform: none; } }
        @keyframes memberRowIn { from { opacity: 0; transform: translateY(9px); } to { opacity: 1; transform: none; } }
        @keyframes memberSheetIn { from { opacity: 0; transform: translateY(22px) scale(0.985); } to { opacity: 1; transform: none; } }
        @keyframes noticeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .group-info-shell, .member-count-pill, .member-row, .member-sheet, .notice-pop { animation: none; } }
      `}</style>
    </main>
  );
}
