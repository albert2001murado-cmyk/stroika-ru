"use client";
import { useState, type FormEvent } from "react";
import VerificationAttachments from "./VerificationAttachments";
import { useVerificationApplication } from "@/lib/useVerificationApplication";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Clock3,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "./AuthProvider";
import {
  VERIFICATION_CATEGORIES,
  VERIFICATION_ROLES,
  isAccountVerified,
} from "@/lib/accountVerification";
import { getApiUrl } from "@/lib/getApiUrl";

export default function AccountVerificationForm() {
  const { user, profile, loading: authLoading } = useAuth();
  const application = useVerificationApplication(
    user,
    profile,
    getApiUrl("/api/verification"),
  );
  const { form, state, loading, sending, error, change, load } = application;
  const [uploading, setUploading] = useState(false);
  const individual = form.accountType === "individual";
  const verified = isAccountVerified(profile) || state?.verified === true;
  async function submit(event: FormEvent) {
    event.preventDefault();
    await application.submit();
  }
  const pending = state?.request?.status === "pending",
    rejected = state?.request?.status === "rejected";
  const input =
    "mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50 disabled:bg-slate-50";
  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 text-slate-950 sm:py-9">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/profile"
          className="inline-flex items-center gap-2 text-sm font-bold text-blue-700"
        >
          <ArrowLeft size={18} />В профиль
        </Link>
        <header className="mt-5 rounded-[28px] bg-[#0057ff] px-6 py-7 text-white sm:px-9">
          <div className="flex items-center gap-2 text-sm font-bold text-blue-100">
            <ShieldCheck size={20} />
            Строва
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">
            Проверка аккаунта
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100">
            Проверка добровольная. Публиковать объявления можно и без неё. После
            одобрения модератором в профиле и объявлениях появится отметка
            «Проверен».
          </p>
        </header>
        {authLoading || loading ? (
          <div className="flex justify-center py-14">
            <Loader2
              className="animate-spin text-blue-600"
              aria-label="Загружаем статус"
            />
          </div>
        ) : !user ? (
          <div className="mt-6 rounded-3xl bg-white p-7">
            <h2 className="text-xl font-bold">Войдите в аккаунт</h2>
            <Link href="/auth" className="btn-primary mt-5 inline-flex">
              Войти
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid items-start gap-5 md:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="order-2 rounded-3xl md:order-1 border border-slate-100 bg-white p-6">
              <ShieldCheck size={28} className="text-blue-600" />
              <h2 className="mt-4 text-lg font-bold">
                Один статус для всех ролей
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Галочка действует и для исполнителя, и для заказчика. Заявка
                отправится только после заполнения формы и нажатия кнопки ниже.
              </p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-500">
                Телефон берётся из профиля. Изменить его можно в настройках
                профиля.
              </p>
              <Link
                href="/profile"
                className="mt-3 inline-flex text-sm font-bold text-blue-700"
              >
                Открыть профиль →
              </Link>
            </aside>
            <section className="order-1 rounded-3xl md:order-2 border border-slate-100 bg-white p-5 sm:p-7">
              {error ? (
                <div
                  role="alert"
                  className="mb-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700"
                >
                  {error}
                  {!state ? (
                    <button
                      type="button"
                      onClick={() => void load()}
                      className="ml-2 font-bold underline"
                    >
                      Повторить
                    </button>
                  ) : null}
                </div>
              ) : null}
              {verified ? (
                <div className="py-5">
                  <BadgeCheck size={36} className="text-blue-600" />
                  <h2 className="mt-4 text-2xl font-bold">
                    Ваш аккаунт проверен
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    Отметка «Проверен» отображается в профиле и у ваших
                    публикаций на сайте и в приложении.
                  </p>
                  <Link
                    href="/profile"
                    className="btn-primary mt-6 inline-flex"
                  >
                    Вернуться в профиль
                  </Link>
                </div>
              ) : pending ? (
                <div className="py-5">
                  <Clock3 size={34} className="text-blue-600" />
                  <h2 className="mt-4 text-2xl font-bold">
                    Заявка у модератора
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    Повторно отправлять её не нужно. Результат появится здесь и
                    в уведомлениях. Пока идёт проверка, можно размещать
                    объявления.
                  </p>
                  <button
                    type="button"
                    onClick={() => void load()}
                    className="mt-5 text-sm font-bold text-blue-700"
                  >
                    Обновить статус
                  </button>
                </div>
              ) : application.cooldown ? (
                <div className="py-4">
                  <Clock3 size={34} className="text-blue-600" />
                  <h2 className="mt-4 text-2xl font-bold">
                    Повторная заявка через 24 часа
                  </h2>
                  <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                    {state?.request?.moderatorComment ||
                      "Уточните данные перед повторной проверкой."}
                  </p>
                  <p className="mt-4 text-sm leading-6 text-slate-500">
                    Заполнить форму и отправить её ещё раз можно с{" "}
                    <b className="text-slate-800">
                      {new Date(application.retryAt).toLocaleString("ru-RU", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </b>
                    . Размещение объявлений остаётся доступным.
                  </p>
                  <Link
                    href="/profile"
                    className="mt-5 inline-flex text-sm font-bold text-blue-700"
                  >
                    В профиль →
                  </Link>
                </div>
              ) : state ? (
                <form onSubmit={submit} className="space-y-5">
                  {rejected ? (
                    <div className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                      <b>Нужно уточнить данные</b>
                      <p>
                        {state.request?.moderatorComment ||
                          "Уточните информацию и отправьте заявку ещё раз."}
                      </p>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-sm font-bold">Ваша роль</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {VERIFICATION_ROLES.map((role) => (
                        <button
                          type="button"
                          key={role.id}
                          aria-pressed={form.role === role.id}
                          onClick={() => change("role", role.id)}
                          className={`rounded-xl border px-4 py-2.5 text-sm font-bold ${form.role === role.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"}`}
                        >
                          {role.title}
                        </button>
                      ))}
                    </div>
                  </div>
                  {individual ? (
                    <section className="rounded-2xl bg-slate-50 p-4">
                      <h3 className="font-bold">Личные данные</h3>
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        Только для проверки — ФИО и год рождения не публикуются
                        в объявлениях. Паспорт прикладывать не нужно.
                      </p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        {(
                          [
                            ["lastName", "Фамилия"],
                            ["firstName", "Имя"],
                            ["patronymic", "Отчество, если есть"],
                            ["birthYear", "Год рождения"],
                          ] as const
                        ).map(([key, title]) => (
                          <label key={key} className="block text-sm font-bold">
                            {title}
                            <input
                              aria-label={title}
                              required={key !== "patronymic"}
                              maxLength={key === "birthYear" ? 4 : 60}
                              inputMode={
                                key === "birthYear" ? "numeric" : "text"
                              }
                              value={form[key]}
                              onChange={(event) =>
                                change(
                                  key,
                                  key === "birthYear"
                                    ? event.target.value.replace(/\D/g, "")
                                    : event.target.value,
                                )
                              }
                              className={input}
                              autoComplete={
                                key === "firstName"
                                  ? "given-name"
                                  : key === "lastName"
                                    ? "family-name"
                                    : key === "patronymic"
                                      ? "additional-name"
                                      : "bday-year"
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </section>
                  ) : (
                    <section className="space-y-4 rounded-2xl bg-slate-50 p-4">
                      <div>
                        <p className="text-xs text-slate-500">
                          {form.accountType === "ip"
                            ? "Индивидуальный предприниматель"
                            : "Общество с ограниченной ответственностью"}
                        </p>
                        <p className="mt-1 break-words font-bold">
                          {String(
                            profile?.companyName ||
                              profile?.displayName ||
                              "Компания",
                          )}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          ИНН {String(profile?.companyInn || "не указан")}
                        </p>
                      </div>
                      <label className="block text-sm font-bold">
                        ФИО представителя
                        <input
                          aria-label="ФИО представителя"
                          required
                          maxLength={120}
                          value={form.name}
                          onChange={(event) =>
                            change("name", event.target.value)
                          }
                          className={input}
                          autoComplete="name"
                        />
                      </label>
                      <p className="text-sm font-bold">
                        Ваша связь с компанией
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(["owner", "representative"] as const).map((role) => (
                          <button
                            key={role}
                            type="button"
                            onClick={() => change("companyRole", role)}
                            aria-pressed={form.companyRole === role}
                            className={`rounded-xl border px-3 py-2 text-sm font-semibold ${form.companyRole === role ? "border-blue-500 bg-white text-blue-700" : "border-slate-200 text-slate-500"}`}
                          >
                            {role === "representative"
                              ? "Представитель"
                              : form.accountType === "ip"
                                ? "Я — предприниматель"
                                : "Владелец / руководитель"}
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="block text-sm font-bold">
                      Телефон из профиля
                      <input
                        value={form.phone}
                        readOnly
                        className={input + " bg-slate-50 text-slate-500"}
                      />
                      <span className="mt-1 block text-xs font-normal text-slate-400">
                        Меняется в настройках профиля
                      </span>
                    </label>
                    <label className="block text-sm font-bold">
                      Город
                      <input
                        required
                        maxLength={120}
                        value={form.city}
                        onChange={(event) => change("city", event.target.value)}
                        className={input}
                        autoComplete="address-level2"
                      />
                    </label>
                  </div>
                  {form.role !== "customer" ? (
                    <div className="grid gap-5 sm:grid-cols-2">
                      <label className="block text-sm font-bold">
                        Направление
                        <select
                          value={form.category}
                          onChange={(event) =>
                            change("category", event.target.value)
                          }
                          className={input}
                        >
                          {VERIFICATION_CATEGORIES.map((category) => (
                            <option key={category}>{category}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm font-bold">
                        Опыт{" "}
                        <span className="font-normal text-slate-400">
                          необязательно
                        </span>
                        <input
                          maxLength={80}
                          value={form.experience}
                          onChange={(event) =>
                            change("experience", event.target.value)
                          }
                          placeholder="Например, 5 лет"
                          className={input}
                        />
                      </label>
                    </div>
                  ) : null}
                  <label className="block text-sm font-bold">
                    {individual
                      ? form.role === "customer"
                        ? "О себе и ваших задачах"
                        : "Ваша деятельность"
                      : "О компании и её деятельности"}
                    <textarea
                      required
                      minLength={20}
                      maxLength={3000}
                      value={form.message}
                      onChange={(event) =>
                        change("message", event.target.value)
                      }
                      placeholder={
                        form.role === "customer"
                          ? "Какие задачи планируете размещать, в каком городе работаете…"
                          : "Чем занимаетесь, какие работы выполняете, что важно знать о вас…"
                      }
                      className={input + " min-h-36 resize-y font-normal"}
                    />
                    <span className="mt-1 block text-right text-xs font-normal text-slate-400">
                      {form.message.length} / 3000
                    </span>
                  </label>
                  <VerificationAttachments
                    key={user.uid}
                    accountType={form.accountType}
                    files={form.attachments}
                    onChange={(files) => change("attachments", files)}
                    onBusyChange={setUploading}
                    disabled={sending}
                  />
                  <button
                    disabled={sending || uploading}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#0057ff] px-5 py-3 font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {sending ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <ShieldCheck size={18} />
                    )}
                    {sending
                      ? "Отправляем…"
                      : rejected
                        ? "Отправить повторно"
                        : "Отправить на проверку"}
                  </button>
                </form>
              ) : null}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
