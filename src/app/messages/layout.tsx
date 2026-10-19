"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Loader2, MessageCircle } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import ChatSidebar from "@/components/ChatSidebar";
import styles from "./messages.module.css";

export default function MessagesLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const segments = pathname.split("/").filter(Boolean);
  const conversation = segments.length === 2 && segments[1] !== "new-group";
  if (segments.length > 2 || segments[1] === "new-group") return children;

  if (loading || !user) {
    return <main className={styles.authState}>
      {loading ? <><Loader2 size={24} className={styles.spinner} /><p>Загружаем сообщения…</p></> : <>
        <MessageCircle size={32} /><h1>Ваши сообщения</h1><p>Войдите, чтобы открыть переписки.</p>
        <Link href="/auth" className={styles.primaryButton}>Войти в аккаунт</Link>
      </>}
    </main>;
  }

  return <main className={styles.workspace}>
    <div className={styles.frame} data-conversation={conversation}>
      <ChatSidebar uid={user.uid} activeChatId={conversation ? decodeURIComponent(segments[1]) : ""} />
      <div key={`${user.uid}:${pathname}`} className={styles.content}>{children}</div>
    </div>
  </main>;
}
