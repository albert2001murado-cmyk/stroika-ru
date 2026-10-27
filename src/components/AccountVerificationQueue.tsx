"use client";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "./AuthProvider";
import { useVerificationQueue } from "@/lib/useVerificationQueue";
import {
  verificationRoleLabel,
  verificationStatusLabel,
  type VerificationStatus,
} from "@/lib/accountVerification";
import { getApiUrl } from "@/lib/getApiUrl";

export default function AccountVerificationQueue() {
  const { user, loading } = useAuth();
  const q = useVerificationQueue(
      user,
      getApiUrl("/api/moderation/verification"),
      !loading,
    ),
    item = q.selected;
  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-7 text-slate-950">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/moderator/reports"
          className="inline-flex items-center gap-2 text-sm font-bold text-blue-700"
        >
          <ArrowLeft size={18} />
          Объявления и жалобы
        </Link>
        <header className="mt-5 flex flex-wrap items-center justify-between gap-5 rounded-[28px] bg-[#0057ff] p-7 text-white">
          <div>
            <ShieldCheck size={25} />
            <h1 className="mt-3 text-3xl font-bold">Проверка аккаунтов</h1>
            <p className="mt-2 text-sm text-blue-100">
              Заявки исполнителей, заказчиков и организаций
            </p>
          </div>
          <button
            disabled={q.loading || q.working}
            onClick={() => void q.refresh()}
            className="rounded-2xl bg-white/15 p-3"
            aria-label="Обновить список"
          >
            <RefreshCw size={20} />
          </button>
        </header>
        {!user && !loading ? (
          <Link href="/auth" className="btn-primary mt-6 inline-flex">
            Войти
          </Link>
        ) : (
          <>
            <div className="my-5 flex flex-wrap gap-2">
              {(
                ["pending", "approved", "rejected"] as VerificationStatus[]
              ).map((status) => (
                <button
                  disabled={q.working}
                  key={status}
                  onClick={() => q.setStatus(status)}
                  className={`rounded-xl px-5 py-3 text-sm font-bold ${q.status === status ? "bg-blue-600 text-white" : "bg-white text-slate-500"}`}
                >
                  {verificationStatusLabel(status)}
                </button>
              ))}
            </div>
            {q.error ? (
              <p
                role="alert"
                className="mb-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700"
              >
                {q.error}
              </p>
            ) : null}
            <div className="grid items-start gap-5 md:grid-cols-[320px_minmax(0,1fr)]">
              <section className="space-y-3">
                {q.loading ? (
                  <Loader2 className="mx-auto my-8 animate-spin text-blue-600" />
                ) : !q.items.length ? (
                  <p className="rounded-3xl bg-white p-6 text-sm text-slate-500">
                    {q.error
                      ? "Список недоступен. Повторите загрузку."
                      : "В этом разделе пока нет заявок."}
                  </p>
                ) : (
                  q.items.map((request) => (
                    <button
                      disabled={q.working}
                      key={request.id}
                      onClick={() => q.select(request)}
                      className={`w-full rounded-2xl border bg-white p-5 text-left ${item?.id === request.id ? "border-blue-500" : "border-slate-100"}`}
                    >
                      <span className="block truncate font-bold">
                        {request.name || "Пользователь"}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {verificationRoleLabel(request.role)} ·{" "}
                        {request.city || "Город не указан"}
                      </span>
                      <span className="mt-3 block text-xs text-blue-700">
                        Открыть заявку →
                      </span>
                    </button>
                  ))
                )}
                {q.cursor ? (
                  <button
                    disabled={q.more || q.working}
                    onClick={() => void q.loadMore()}
                    className="w-full py-3 text-sm font-bold text-blue-700"
                  >
                    {q.more ? "Загружаем…" : "Показать ещё"}
                  </button>
                ) : null}
              </section>
              <section className="min-w-0 rounded-3xl border border-slate-100 bg-white p-6 sm:p-7">
                {!item ? (
                  <div className="py-10 text-center text-sm text-slate-500">
                    <ShieldCheck
                      className="mx-auto mb-4 text-blue-500"
                      size={30}
                    />
                    Выберите заявку, чтобы проверить данные.
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <h2 className="break-words text-2xl font-bold">
                        {item.name}
                      </h2>
                      <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
                        {verificationStatusLabel(item.status)}
                      </span>
                    </div>
                    <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                      {[
                        ["Роль", verificationRoleLabel(item.role)],
                        ["Телефон", item.phone],
                        ["Почта", item.email],
                        ["Город", item.city],
                        ["Направление", item.category],
                        ["Опыт", item.experience],
                        ["Организация", item.companyName],
                        ["ИНН", item.inn],
                        ["ОГРН / ОГРНИП", item.ogrn],
                        ["Юридический адрес", item.legalAddress],
                      ]
                        .filter(([, value]) => value)
                        .map(([label, value]) => (
                          <div key={label} className="min-w-0">
                            <dt className="text-xs text-slate-400">{label}</dt>
                            <dd className="mt-1 break-words font-medium">
                              {value}
                            </dd>
                          </div>
                        ))}
                    </dl>
                    <div className="mt-6 rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs text-slate-400">
                        О себе или компании
                      </p>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
                        {item.message ||
                          "Заявка организации из регистрации. Проверьте реквизиты выше."}
                      </p>
                    </div>
                    <Link
                      href={`/user/${encodeURIComponent(item.userId)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex text-sm font-bold text-blue-700"
                    >
                      Открыть публичный профиль →
                    </Link>
                    {item.status === "pending" ? (
                      <div className="mt-6 border-t border-slate-100 pt-5">
                        <label className="text-sm font-bold">
                          Комментарий модератора
                          <textarea
                            value={q.comment}
                            disabled={q.working}
                            onChange={(event) =>
                              q.setComment(event.target.value)
                            }
                            maxLength={1000}
                            placeholder="При отказе укажите, что нужно исправить"
                            className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 p-4 text-sm outline-none focus:border-blue-500"
                          />
                        </label>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            disabled={q.working}
                            onClick={() => void q.review("approved")}
                            className="flex min-h-12 items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                          >
                            {q.working ? (
                              <Loader2 className="animate-spin" size={18} />
                            ) : (
                              <Check size={18} />
                            )}
                            Одобрить
                          </button>
                          <button
                            disabled={q.working}
                            onClick={() => void q.review("rejected")}
                            className="rounded-2xl bg-red-50 px-5 py-3 text-sm font-bold text-red-600 disabled:opacity-50"
                          >
                            Отклонить с причиной
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm">
                        <p className="whitespace-pre-wrap break-words">
                          {item.moderatorComment || "Заявка рассмотрена."}
                        </p>
                        {item.status === "approved" ? (
                          <button
                            disabled={q.working}
                            onClick={() => void q.review("approved")}
                            className="mt-3 font-bold text-blue-700"
                          >
                            Обновить отметки в объявлениях
                          </button>
                        ) : null}
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
