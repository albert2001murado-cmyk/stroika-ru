"use client";

import { useAuth } from "@/components/AuthProvider";
import type { AccountType } from "@/types";
import {
  Building2,
  Lock,
  Mail,
  MapPin,
  Phone,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function AuthPage() {
  const router = useRouter();
  const { register, login } = useAuth();

  const [mode, setMode] = useState<"register" | "login">("register");
  const [displayName, setDisplayName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("individual");
  const [companyName, setCompanyName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("vexorium.official@mail.ru");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    setError("");
    setSending(true);

    try {
      if (mode === "register") {
        await register({
          email,
          password,
          displayName,
          accountType,
          companyName,
          city,
          phone,
        });
      } else {
        await login(email, password);
      }

      router.push("/");
    } catch (err) {
      console.error(err);
      setError("Не получилось войти или зарегистрироваться. Проверь данные.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb]">
      <div className="grid min-h-[calc(100vh-80px)] lg:grid-cols-[0.85fr_1.15fr]">
        <section className="hidden bg-[#0057ff] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="text-3xl font-black text-[#ffd233]">Стройка.ру</p>
            <p className="mt-2 font-bold text-blue-100">
              строительные услуги рядом
            </p>
          </div>

          <div>
            <h1 className="max-w-xl text-5xl font-black leading-tight">
              Создайте профиль и размещайте строительные услуги
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-blue-50">
              Выбирайте тип аккаунта: физлицо, ИП или ООО. После входа можно
              публиковать объявления, получать отзывы и сообщения.
            </p>
          </div>

          <div className="grid gap-3">
            <div className="rounded-3xl bg-white/10 p-5 backdrop-blur">
              Красивые анкеты исполнителей
            </div>
            <div className="rounded-3xl bg-white/10 p-5 backdrop-blur">
              Фото, видео, цена и способы оплаты
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-10">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-2xl rounded-[34px] bg-white p-7 shadow-xl shadow-blue-900/10"
          >
            <h1 className="text-4xl font-black text-gray-950">
              {mode === "register" ? "Создать аккаунт" : "Войти в аккаунт"}
            </h1>
            <p className="mt-3 text-gray-500">
              {mode === "register"
                ? "Зарегистрируйтесь и начните размещать строительные услуги."
                : "Войдите, чтобы управлять объявлениями."}
            </p>

            <div className="mt-7 grid grid-cols-2 rounded-[24px] bg-gray-100 p-2">
              <button
                type="button"
                onClick={() => setMode("register")}
                className={`rounded-[18px] px-5 py-4 font-black transition ${
                  mode === "register"
                    ? "bg-[#0057ff] text-white shadow-lg shadow-blue-600/20"
                    : "text-gray-500"
                }`}
              >
                Регистрация
              </button>

              <button
                type="button"
                onClick={() => setMode("login")}
                className={`rounded-[18px] px-5 py-4 font-black transition ${
                  mode === "login"
                    ? "bg-[#0057ff] text-white shadow-lg shadow-blue-600/20"
                    : "text-gray-500"
                }`}
              >
                Вход
              </button>
            </div>

            <div className="mt-6 space-y-4">
              {mode === "register" && (
                <>
                  <div className="relative">
                    <UserRound
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                      size={20}
                    />
                    <input
                      className="input"
                      style={{ paddingLeft: "70px" }}
                      placeholder="Имя или название исполнителя"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { value: "individual", label: "Физлицо" },
                      { value: "ip", label: "ИП" },
                      { value: "ooo", label: "ООО" },
                    ].map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setAccountType(item.value as AccountType)}
                        className={`rounded-2xl border px-4 py-4 font-black transition hover:-translate-y-0.5 ${
                          accountType === item.value
                            ? "border-[#0057ff] bg-blue-50 text-[#0057ff]"
                            : "border-gray-200 bg-white text-gray-600"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  {(accountType === "ip" || accountType === "ooo") && (
                    <div className="relative">
                      <Building2
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                        size={20}
                      />
                      <input
                        className="input"
                        style={{ paddingLeft: "70px" }}
                        placeholder="Название ИП или ООО"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        required
                      />
                    </div>
                  )}

                  <div className="relative">
                    <MapPin
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                      size={20}
                    />
                    <input
                      className="input"
                      style={{ paddingLeft: "70px" }}
                      placeholder="Город"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      required
                    />
                  </div>

                  <div className="relative">
                    <Phone
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                      size={20}
                    />
                    <input
                      className="input"
                      style={{ paddingLeft: "70px" }}
                      placeholder="Телефон"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}

              <div className="relative">
                <Mail
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                  size={20}
                />
                <input
                  className="input"
                  style={{ paddingLeft: "70px" }}
                  type="email"
                  placeholder="Почта"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="relative">
                <Lock
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                  size={20}
                />
                <input
                  className="input"
                  style={{ paddingLeft: "70px" }}
                  type="password"
                  placeholder="Пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && (
              <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-black text-red-600">
                {error}
              </p>
            )}

            <button
              disabled={sending}
              className="mt-6 w-full rounded-2xl bg-[#0057ff] px-5 py-4 text-lg font-black text-white transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-600/25 disabled:opacity-70"
            >
              {sending
                ? "Подождите..."
                : mode === "register"
                ? "Создать аккаунт"
                : "Войти"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
