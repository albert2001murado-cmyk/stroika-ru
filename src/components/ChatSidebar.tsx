"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, MessageCircle, Pin, Plus, Search, UsersRound, X } from "lucide-react";
import { chatPreview, formatTime, getChatDisplay, getUnreadCount, getTime, hasUserMarker, isChatPinned, isGroupChat, type Chat } from "@/lib/chatList";
import { setChatPinned } from "@/lib/chatPin";
import { useChatList } from "@/lib/useChatList";
import styles from "@/app/messages/messages.module.css";

export default function ChatSidebar({ uid, activeChatId }: { uid: string; activeChatId: string }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "groups">("all");
  const [reload, setReload] = useState(0);
  const [pinningId, setPinningId] = useState("");
  const [pinError, setPinError] = useState("");
  const { chats, loading, error } = useChatList(uid, reload);
  const visible = useMemo(() => chats.filter(chat => !hasUserMarker(chat.hiddenFor, uid)), [chats, uid]);
  const unreadChats = visible.filter(chat => getUnreadCount(chat, uid) > 0).length;
  const filtered = useMemo(() => {
    const value = search.trim().toLocaleLowerCase("ru-RU");
    return visible.filter(chat => {
      if (filter === "unread" && !getUnreadCount(chat, uid)) return false;
      if (filter === "groups" && !isGroupChat(chat)) return false;
      const other = getChatDisplay(chat, uid);
      return !value || [other.displayName, chat.listingTitle || "", chatPreview(chat)].some(text => text.toLocaleLowerCase("ru-RU").includes(value));
    }).sort((a, b) => getTime(b) - getTime(a) || a.id.localeCompare(b.id));
  }, [visible, uid, search, filter]);
  const pinned = filtered.filter(chat => isChatPinned(chat, uid));
  const rest = filtered.filter(chat => !isChatPinned(chat, uid));

  async function togglePin(chat: Chat) {
    if (pinningId) return;
    setPinningId(chat.id);
    setPinError("");
    try { await setChatPinned(chat.id, chat.pinnedBy, uid, !isChatPinned(chat, uid)); }
    catch { setPinError("Не удалось изменить закрепление. Попробуйте ещё раз."); }
    finally { setPinningId(""); }
  }

  function row(chat: Chat) {
    const other = getChatDisplay(chat, uid);
    const isPinned = isChatPinned(chat, uid);
    const unread = getUnreadCount(chat, uid);
    const active = activeChatId === chat.id;
    const initials = other.displayName.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toLocaleUpperCase("ru-RU");
    return <li key={chat.id} className={styles.chatRow} data-active={active} data-unread={unread > 0}>
      <Link href={`/messages/${encodeURIComponent(chat.id)}`} aria-current={active ? "page" : undefined} className={styles.chatLink}>
        <span className={styles.avatar} data-group={other.isGroup}>
          {other.avatarUrl ? <img src={other.avatarUrl} alt="" /> : other.isGroup ? <UsersRound size={22} /> : <span>{initials || "П"}</span>}
        </span>
        <span className={styles.chatCopy}>
          <span className={styles.rowTop}><span className={styles.chatName}>{other.displayName}</span><time className={styles.chatTime}>{formatTime(chat)}</time></span>
          {chat.listingTitle ? <span className={styles.chatSubject}>{chat.listingTitle}</span> : null}
          <span className={styles.rowBottom}><span className={styles.preview}>{chat.lastSenderId === uid ? "Вы: " : ""}{chatPreview(chat)}</span>{unread > 0 ? <span className={styles.unread} aria-label={`${unread} непрочитанных`}>{unread > 99 ? "99+" : unread}</span> : null}</span>
        </span>
      </Link>
      <button type="button" className={styles.pinButton} data-pinned={isPinned} disabled={Boolean(pinningId)} onClick={() => void togglePin(chat)} title={isPinned ? "Открепить чат" : "Закрепить чат"} aria-label={`${isPinned ? "Открепить" : "Закрепить"} чат ${other.displayName}`} aria-pressed={isPinned}>
        {pinningId === chat.id ? <Loader2 size={13} className={styles.spinner} /> : <Pin size={13} fill={isPinned ? "currentColor" : "none"} />}
      </button>
    </li>;
  }

  return <aside className={styles.sidebar} aria-label="Ваши переписки">
    <div className={styles.sidebarHead}><div><span className={styles.smallLabel}>Личный кабинет</span><h1>Сообщения{unreadChats > 0 ? <span className={styles.totalBadge}>{unreadChats}</span> : null}</h1></div><Link href="/messages/new-group" className={styles.composeButton} title="Создать группу" aria-label="Создать группу"><Plus size={21} /></Link></div>
    <div className={styles.search}><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Поиск переписки" aria-label="Поиск переписки" />{search ? <button type="button" onClick={() => setSearch("")} aria-label="Очистить поиск"><X size={15} /></button> : null}</div>
    <div className={styles.filters} aria-label="Фильтр чатов">{([["all", "Все"], ["unread", "Новые"], ["groups", "Группы"]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value}>{label}{value === "unread" && unreadChats > 0 ? <span>{unreadChats}</span> : null}</button>)}</div>
    {pinError ? <p className={styles.sidebarError} role="alert">{pinError}</p> : null}
    <div className={styles.chatScroll} aria-busy={loading}>
      {error ? <div className={styles.listState}><MessageCircle size={25} /><p>{error}</p><button type="button" onClick={() => setReload(value => value + 1)}>Повторить</button></div> : loading && !filtered.length ? <div className={styles.skeletons} aria-label="Загрузка чатов">{[0, 1, 2, 3].map(i => <div key={i}><span /><span /></div>)}</div> : filtered.length ? <>
        {pinned.length > 0 ? <section className={styles.chatGroup}><h2><Pin size={12} />Закреплённые<span>{pinned.length}</span></h2><ul>{pinned.map(row)}</ul></section> : null}
        {rest.length > 0 ? <section className={styles.chatGroup}>{pinned.length > 0 ? <h2>Переписки<span>{rest.length}</span></h2> : null}<ul>{rest.map(row)}</ul></section> : null}
      </> : <div className={styles.listState}><MessageCircle size={26} /><p>{search ? "Переписка не найдена" : filter === "unread" ? "Все сообщения прочитаны" : filter === "groups" ? "У вас пока нет групп" : "Здесь появятся ваши переписки"}</p>{!search && filter !== "unread" ? <Link href="/messages/new-group">Создать группу</Link> : null}</div>}
    </div>
    <div className={styles.sidebarFoot}><span className={styles.brandMark}>с.</span><span>Строва<span>Договориться проще</span></span></div>
  </aside>;
}
