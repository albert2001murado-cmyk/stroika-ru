"use client";

import { useAuth } from "@/components/AuthProvider";
import { getApiUrl } from "@/lib/getApiUrl";
import {
  AlertCircle,
  ArrowLeft,
  AtSign,
  CheckCircle2,
  Clock,
  FileQuestion,
  Hammer,
  Headphones,
  Link as LinkIcon,
  Loader2,
  Mail,
  MessageSquare,
  Send,
  ShieldCheck,
  User,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type SupportForm = {
  name: string;
  email: string;
  topic: string;
  priority: string;
  message: string;
};

const topics = [
  "Проблема с объявлением",
  "Проблема с фото или видео",
  "Проблема с сообщениями",
  "Проблема со входом",
  "Жалоба на пользователя",
  "Предложение по сайту",
  "Другое",
];

const priorities = [
  "Обычный вопрос",
  "Важно",
  "Срочно",
];

export default function SupportPage() {
  const { user, profile } = useAuth();

  const [form, setForm] = useState<SupportForm>({
    name: "",
    email: "",
    topic: topics[0],
    priority: priorities[0],
    message: "",
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      name:
        current.name ||
        profile?.displayName ||
        user?.displayName ||
        "",
      email: current.email || user?.email || profile?.email || "",
    }));
  }, [profile?.displayName, profile?.email, user?.displayName, user?.email]);

  function updateField<K extends keyof SupportForm>(
    key: K,
    value: SupportForm[K]
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!form.name.trim()) {
      setError("Укажи имя, чтобы поддержка понимала, к кому обращаться.");
      return;
    }

    if (!form.email.trim()) {
      setError("Укажи email для ответа.");
      return;
    }

    if (form.message.trim().length < 10) {
      setError("Опиши проблему чуть подробнее. Минимум 10 символов.");
      return;
    }

    setIsSending(true);

    try {
      const response = await fetch(getApiUrl("/api/support"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          userId: user?.uid || "",
          userEmail: user?.email || "",
          pageUrl:
            typeof window !== "undefined"
              ? window.location.href
              : "",
          userAgent:
            typeof navigator !== "undefined"
              ? navigator.userAgent
              : "",
        }),
      });

      const text = await response.text();

      let data: any = null;

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        throw new Error("API /api/support не вернул JSON.");
      }

      if (!response.ok) {
        throw new Error(data?.error || "Не получилось отправить обращение.");
      }

      setSuccess(
        data?.message ||
          "Обращение отправлено. Мы ответим на указанную почту."
      );

      setForm((current) => ({
        ...current,
        topic: topics[0],
        priority: priorities[0],
        message: "",
      }));
    } catch (sendError) {
      console.error(sendError);
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Не получилось отправить обращение."
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-5 py-10">
      <div className="mx-auto max-w-7xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-[#0057ff] shadow-sm"
        >
          <ArrowLeft size={18} />
          На главную
        </Link>

        <section className="mt-8 overflow-hidden rounded-[42px] bg-[#0057ff] text-white shadow-2xl shadow-blue-500/20">
          <div className="relative grid gap-8 px-6 py-10 md:px-10 lg:grid-cols-[1.1fr_0.9fr] lg:px-14 lg:py-14">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-28 left-1/4 h-72 w-72 rounded-full bg-[#ffde3d]/20 blur-3xl" />

            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-3 text-sm font-black text-[#ffde3d] backdrop-blur">
                <Headphones size={18} />
                Поддержка Стройка.ру
              </div>

              <h1 className="mt-7 max-w-3xl text-4xl font-black leading-tight md:text-6xl">
                Поможем решить проблему на сайте
              </h1>

              <p className="mt-6 max-w-2xl text-lg font-medium leading-8 text-white/80">
                Напиши, что случилось: проблема с объявлением, фото, сообщениями,
                входом или пользователем. Обращение придёт на рабочую почту
                поддержки.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="rounded-3xl bg-white/10 p-5 backdrop-blur">
                  <Clock className="text-[#ffde3d]" size={28} />
                  <p className="mt-3 font-black">Быстрый ответ</p>
                  <p className="mt-1 text-sm text-white/70">
                    Видим тему, срочность и контакты.
                  </p>
                </div>

                <div className="rounded-3xl bg-white/10 p-5 backdrop-blur">
                  <ShieldCheck className="text-[#ffde3d]" size={28} />
                  <p className="mt-3 font-black">Безопасно</p>
                  <p className="mt-1 text-sm text-white/70">
                    Не просим пароль и лишние данные.
                  </p>
                </div>

                <div className="rounded-3xl bg-white/10 p-5 backdrop-blur">
                  <Hammer className="text-[#ffde3d]" size={28} />
                  <p className="mt-3 font-black">По делу</p>
                  <p className="mt-1 text-sm text-white/70">
                    Для строителей, клиентов и объявлений.
                  </p>
                </div>
              </div>
            </div>

            <div className="relative z-10 rounded-[34px] bg-white p-6 text-gray-950 shadow-2xl md:p-8">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#ffde3d] text-[#0057ff]">
                  <Headphones size={30} strokeWidth={2.7} />
                </div>

                <div>
                  <h2 className="text-2xl font-black">Новое обращение</h2>
                  <p className="mt-1 text-sm font-medium text-gray-500">
                    Заполни форму — письмо уйдёт на почту поддержки.
                  </p>
                </div>
              </div>

              {error && (
                <div className="mt-6 flex gap-3 rounded-2xl bg-red-50 px-4 py-4 text-sm font-bold text-red-700">
                  <AlertCircle className="shrink-0" size={20} />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="mt-6 flex gap-3 rounded-2xl bg-green-50 px-4 py-4 text-sm font-bold text-green-700">
                  <CheckCircle2 className="shrink-0" size={20} />
                  <span>{success}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-sm font-black text-gray-700">
                      <User size={16} />
                      Имя
                    </span>
                    <input
                      value={form.name}
                      onChange={(event) =>
                        updateField("name", event.target.value)
                      }
                      className="input"
                      placeholder="Как к вам обращаться"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-sm font-black text-gray-700">
                      <AtSign size={16} />
                      Email для ответа
                    </span>
                    <input
                      value={form.email}
                      onChange={(event) =>
                        updateField("email", event.target.value)
                      }
                      className="input"
                      type="email"
                      placeholder="example@mail.ru"
                    />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-sm font-black text-gray-700">
                      <FileQuestion size={16} />
                      Тема
                    </span>
                    <select
                      value={form.topic}
                      onChange={(event) =>
                        updateField("topic", event.target.value)
                      }
                      className="input"
                    >
                      {topics.map((topic) => (
                        <option key={topic} value={topic}>
                          {topic}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-sm font-black text-gray-700">
                      <AlertCircle size={16} />
                      Срочность
                    </span>
                    <select
                      value={form.priority}
                      onChange={(event) =>
                        updateField("priority", event.target.value)
                      }
                      className="input"
                    >
                      {priorities.map((priority) => (
                        <option key={priority} value={priority}>
                          {priority}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-black text-gray-700">
                    <MessageSquare size={16} />
                    Что случилось?
                  </span>
                  <textarea
                    value={form.message}
                    onChange={(event) =>
                      updateField("message", event.target.value)
                    }
                    className="input min-h-40 resize-none"
                    placeholder="Опишите проблему: где она появилась, что нажимали, что должно было произойти..."
                  />
                </label>

                <div className="rounded-3xl bg-gray-50 p-4 text-sm font-medium leading-6 text-gray-500">
                  <div className="flex items-start gap-2">
                    <LinkIcon className="mt-0.5 shrink-0 text-[#0057ff]" size={17} />
                    <span>
                      В письмо автоматически добавится страница, с которой было
                      отправлено обращение, чтобы проще найти проблему.
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSending}
                  className="flex w-full items-center justify-center gap-3 rounded-3xl bg-[#0057ff] px-6 py-5 text-lg font-black text-white shadow-xl shadow-blue-500/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSending ? (
                    <>
                      <Loader2 size={22} className="animate-spin" />
                      Отправляем...
                    </>
                  ) : (
                    <>
                      <Send size={22} />
                      Отправить обращение
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-3">
          <div className="rounded-[30px] bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <Mail className="text-[#0057ff]" size={30} />
            <h3 className="mt-4 text-xl font-black text-gray-950">
              Ответ на почту
            </h3>
            <p className="mt-2 text-sm font-medium leading-6 text-gray-500">
              Пользователь указывает email, и поддержка может ответить прямо на
              него.
            </p>
          </div>

          <div className="rounded-[30px] bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <MessageSquare className="text-[#0057ff]" size={30} />
            <h3 className="mt-4 text-xl font-black text-gray-950">
              Подробное описание
            </h3>
            <p className="mt-2 text-sm font-medium leading-6 text-gray-500">
              В обращении будет тема, срочность, сообщение и техническая
              информация.
            </p>
          </div>

          <div className="rounded-[30px] bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <ShieldCheck className="text-[#0057ff]" size={30} />
            <h3 className="mt-4 text-xl font-black text-gray-950">
              Без паролей
            </h3>
            <p className="mt-2 text-sm font-medium leading-6 text-gray-500">
              На странице прямо видно, что пароль и секретные данные отправлять
              не нужно.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
