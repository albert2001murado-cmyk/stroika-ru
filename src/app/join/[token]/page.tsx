"use client";

import { useAuth } from "@/components/AuthProvider";
import { getApiUrl } from "@/lib/getApiUrl";
import { Loader2, MessageCircleMore, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type GroupPreview = { id: string; title: string; avatarUrl?: string; memberCount: number };

export default function JoinGroupPage() {
  const params = useParams<{ token: string }>();
  const inviteToken = String(params?.token || "");
  const router = useRouter();
  const { user, loading } = useAuth();
  const [group, setGroup] = useState<GroupPreview | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(getApiUrl(`/api/groups/resolve?token=${encodeURIComponent(inviteToken)}`), { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Группа не найдена.");
        setGroup(result.group);
      })
      .catch((failure) => {
        if (failure?.name !== "AbortError") setError(failure instanceof Error ? failure.message : "Группа не найдена.");
      })
      .finally(() => setPageLoading(false));
    return () => controller.abort();
  }, [inviteToken]);

  async function join() {
    if (!user || !group || joining) return;
    setJoining(true);
    setError("");
    try {
      const idToken = await user.getIdToken();
      const response = await fetch(getApiUrl("/api/groups/join"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ token: inviteToken }),
      });
      const result = await response.json();
      if (!response.ok || !result.chatId) throw new Error(result.error || "Не получилось войти в группу.");
      router.push(`/messages/${result.chatId}`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Не получилось войти в группу.");
    } finally {
      setJoining(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f7ff] px-4 py-10">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(0,87,255,.18),transparent_32%),radial-gradient(circle_at_84%_80%,rgba(56,189,248,.16),transparent_30%)]" />
      <section className="relative w-full max-w-xl overflow-hidden rounded-[38px] bg-white text-center shadow-[0_30px_90px_rgba(15,23,42,.14)] ring-1 ring-white">
        <div className="bg-gradient-to-br from-[#004bdc] via-[#0057ff] to-[#397eff] px-6 pb-24 pt-8 text-white">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-white/14 px-4 py-2 text-xs font-black uppercase tracking-[.13em] ring-1 ring-white/20"><ShieldCheck size={16} /> Приглашение в группу</div>
        </div>
        <div className="-mt-16 px-6 pb-8 sm:px-9">
          <div className="mx-auto flex h-32 w-32 items-center justify-center overflow-hidden rounded-[36px] border-[6px] border-white bg-blue-50 text-[#0057ff] shadow-xl">
            {group?.avatarUrl ? <img src={group.avatarUrl} alt={group.title} className="h-full w-full object-cover" /> : <UserRound size={48} />}
          </div>

          {pageLoading || loading ? <Loader2 className="mx-auto mt-6 animate-spin text-[#0057ff]" size={28} /> : group ? (
            <>
              <h1 className="mt-5 text-3xl font-black tracking-tight text-slate-950">{group.title}</h1>
              <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-[#0057ff]"><UsersRound size={18} /> {group.memberCount} участников</p>
              <p className="mx-auto mt-4 max-w-md text-sm font-semibold leading-6 text-slate-500">Войти можно только по этой ссылке. После подтверждения чат появится на сайте и в приложении.</p>
              {user ? (
                <button onClick={join} disabled={joining} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0057ff] px-5 py-4 text-base font-black text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-1 hover:bg-[#004de6] active:scale-[.98] disabled:opacity-60">
                  {joining ? <Loader2 className="animate-spin" size={21} /> : <MessageCircleMore size={21} />}
                  {joining ? "Подключаем..." : "Войти в групповой чат"}
                </button>
              ) : (
                <Link href={`/auth?next=${encodeURIComponent(`/join/${inviteToken}`)}`} className="mt-6 flex w-full items-center justify-center rounded-2xl bg-[#0057ff] px-5 py-4 text-base font-black text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-1">Войти и присоединиться</Link>
              )}
            </>
          ) : null}

          {error ? <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-black text-red-600 ring-1 ring-red-100">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}
