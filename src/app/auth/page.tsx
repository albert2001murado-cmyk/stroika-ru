"use client";

import { useAuth } from "@/components/AuthProvider";
import {
  expectedInnLength,
  isValidRussianInn,
  normalizeInn,
} from "@/lib/company-verification";
import type { AccountType, CompanyLookupResult } from "@/types";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CheckCircle2,
  HardHat,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

type LookupState = "idle" | "loading" | "success" | "error";

export default function AuthPage() {
  const router = useRouter();
  const { register, login } = useAuth();

  const [mode, setMode] = useState<"register" | "login">("register");
  const [displayName, setDisplayName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("individual");
  const [inn, setInn] = useState("");
  const [company, setCompany] = useState<CompanyLookupResult | null>(null);
  const [lookupState, setLookupState] = useState<LookupState>("idle");
  const [lookupError, setLookupError] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const isBusiness = accountType === "ip" || accountType === "ooo";
  const innLength = useMemo(() => expectedInnLength(accountType), [accountType]);

  function selectAccountType(next: AccountType) {
    setAccountType(next);
    setInn("");
    setCompany(null);
    setLookupState("idle");
    setLookupError("");
    setError("");
  }

  useEffect(() => {
    if (!isBusiness || !innLength) return;

    const normalized = normalizeInn(inn);
    setCompany(null);
    setLookupError("");

    if (!normalized) {
      setLookupState("idle");
      return;
    }

    if (normalized.length !== innLength) {
      setLookupState("idle");
      return;
    }

    if (!isValidRussianInn(normalized)) {
      setLookupState("error");
      setLookupError("Контрольные цифры ИНН не совпадают. Проверьте номер.");
      return;
    }

    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      setLookupState("loading");

      try {
        const response = await fetch("/api/company-by-inn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inn: normalized, accountType }),
          signal: controller.signal,
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Не получилось проверить ИНН.");
        }

        setCompany(payload.company as CompanyLookupResult);
        setLookupState("success");
      } catch (lookupFailure) {
        if (
          lookupFailure instanceof DOMException &&
          lookupFailure.name === "AbortError"
        ) {
          return;
        }

        setLookupState("error");
        setLookupError(
          lookupFailure instanceof Error
            ? lookupFailure.message
            : "Не получилось проверить ИНН."
        );
      }
    }, 550);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [accountType, inn, innLength, isBusiness]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (mode === "register" && isBusiness) {
      if (!company || lookupState !== "success") {
        setError("Сначала укажите действующий ИНН и дождитесь проверки.");
        return;
      }

      if (company.inn !== normalizeInn(inn)) {
        setError("ИНН был изменён. Дождитесь повторной проверки.");
        return;
      }
    }

    setSending(true);

    try {
      if (mode === "register") {
        await register({
          email,
          password,
          displayName,
          accountType,
          companyInn: isBusiness ? normalizeInn(inn) : undefined,
          city,
          phone,
        });
      } else {
        await login(email, password);
      }

      router.push("/");
    } catch (submitError) {
      console.error(submitError);

      setError(
        submitError instanceof Error
          ? submitError.message
          : "Не получилось войти или зарегистрироваться."
      );
    } finally {
      setSending(false);
    }
  }

  const registrationBlocked =
    mode === "register" && isBusiness && lookupState !== "success";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f4f7fc] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
      <div className="pointer-events-none absolute -left-32 -top-40 h-[420px] w-[420px] rounded-full bg-blue-200/45 blur-[90px]" />
      <div className="pointer-events-none absolute -bottom-44 -right-36 h-[460px] w-[460px] rounded-full bg-cyan-200/35 blur-[100px]" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-100/40 blur-[110px]" />

      <div className="relative mx-auto flex min-h-[calc(100vh-40px)] max-w-7xl flex-col">
        <header className="auth-reveal flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-white/80 bg-white/80 px-4 py-3 shadow-sm shadow-slate-900/5 backdrop-blur-xl sm:px-5">
          <Link
            href="/"
            className="group inline-flex items-center gap-3 rounded-2xl transition duration-300 hover:translate-x-0.5"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0057ff] text-white shadow-lg shadow-blue-600/20 transition duration-300 group-hover:-rotate-3 group-hover:scale-105">
              <HardHat size={25} strokeWidth={2.8} />
            </span>

            <span>
              <span className="block text-xl font-black tracking-[-0.03em] text-slate-950 sm:text-2xl">
                Стройка.ру
              </span>
              <span className="block text-xs font-bold text-slate-400 sm:text-sm">
                все для стройки в одном месте
              </span>
            </span>
          </Link>

          <Link
            href="/"
            className="group inline-flex min-h-11 items-center gap-2 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700 transition duration-300 hover:-translate-y-0.5 hover:bg-blue-50 hover:text-[#0057ff] active:scale-[0.97]"
          >
            <ArrowLeft
              size={17}
              className="transition duration-300 group-hover:-translate-x-1"
            />
            На главную
          </Link>
        </header>

        <section className="flex flex-1 items-center justify-center py-7 sm:py-10">
          <div className="auth-card auth-reveal w-full max-w-4xl overflow-hidden rounded-[38px] border border-white bg-white shadow-[0_30px_90px_rgba(15,23,42,0.12)]">
            <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-r from-blue-50 via-white to-cyan-50 px-6 py-7 sm:px-9 sm:py-9">
              <div className="pointer-events-none absolute -right-10 -top-20 h-44 w-44 rounded-full bg-blue-200/40 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-cyan-200/35 blur-3xl" />

              <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-[#0057ff] shadow-sm ring-1 ring-blue-100">
                    <Sparkles size={14} />
                    Безопасный доступ
                  </div>

                  <h1 className="mt-4 text-3xl font-black tracking-[-0.04em] text-slate-950 sm:text-4xl">
                    {mode === "register"
                      ? "Создайте аккаунт"
                      : "Войдите в аккаунт"}
                  </h1>

                  <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-500 sm:text-base">
                    {mode === "register"
                      ? "Создайте профиль исполнителя, ИП или ООО. Для организаций реквизиты автоматически проверяются по ИНН."
                      : "Войдите, чтобы управлять публикациями, сообщениями и профилем."}
                  </p>
                </div>

                <div className="grid gap-2 text-xs font-bold text-slate-600 sm:grid-cols-2 lg:w-[360px]">
                  <div className="flex items-center gap-2 rounded-2xl bg-white/85 px-3 py-2.5 ring-1 ring-slate-100 backdrop-blur">
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    Проверка реквизитов
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl bg-white/85 px-3 py-2.5 ring-1 ring-slate-100 backdrop-blur">
                    <ShieldCheck size={16} className="text-[#0057ff]" />
                    Защищённая регистрация
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="px-5 py-6 sm:px-9 sm:py-8">
              <div className="grid grid-cols-2 rounded-[22px] bg-slate-100 p-1.5">
                {(["register", "login"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setMode(item);
                      setError("");
                    }}
                    className={`rounded-[17px] px-4 py-3.5 text-sm font-black transition duration-300 hover:-translate-y-0.5 active:scale-[0.98] sm:text-base ${
                      mode === item
                        ? "bg-[#0057ff] text-white shadow-lg shadow-blue-600/20"
                        : "text-slate-500 hover:bg-white/70 hover:text-slate-800"
                    }`}
                  >
                    {item === "register" ? "Регистрация" : "Вход"}
                  </button>
                ))}
              </div>

              <div className="mt-6 space-y-4">
                {mode === "register" ? (
                  <>
                    <div className="relative">
                      <UserRound
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                        size={20}
                      />
                      <input
                        className="input w-full"
                        style={{ paddingLeft: "58px" }}
                        autoComplete="name"
                        placeholder={
                          isBusiness
                            ? "Имя представителя"
                            : "Имя исполнителя"
                        }
                        value={displayName}
                        onChange={(event) =>
                          setDisplayName(event.target.value)
                        }
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
                          onClick={() =>
                            selectAccountType(item.value as AccountType)
                          }
                          className={`group rounded-2xl border px-4 py-4 font-black transition duration-300 hover:-translate-y-1 active:scale-[0.98] ${
                            accountType === item.value
                              ? "border-[#0057ff] bg-blue-50 text-[#0057ff] shadow-md shadow-blue-600/10"
                              : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50/40"
                          }`}
                        >
                          <span className="inline-flex items-center gap-2">
                            {item.value === "individual" ? (
                              <UserRound size={17} />
                            ) : (
                              <Building2 size={17} />
                            )}
                            {item.label}
                          </span>
                        </button>
                      ))}
                    </div>

                    {isBusiness && innLength ? (
                      <div className="space-y-3 rounded-[26px] border border-blue-100 bg-blue-50/35 p-4 sm:p-5">
                        <div className="relative">
                          <Search
                            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                            size={20}
                          />
                          <input
                            className="input w-full pr-14"
                            style={{ paddingLeft: "58px" }}
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={innLength}
                            placeholder={`ИНН ${
                              accountType === "ip" ? "ИП" : "ООО"
                            } — ${innLength} цифр`}
                            value={inn}
                            onChange={(event) =>
                              setInn(normalizeInn(event.target.value))
                            }
                            required
                          />

                          {lookupState === "loading" ? (
                            <Loader2
                              className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-[#0057ff]"
                              size={21}
                            />
                          ) : null}
                        </div>

                        {lookupState === "idle" &&
                        inn.length > 0 &&
                        inn.length < innLength ? (
                          <p className="px-1 text-sm font-bold text-slate-500">
                            Осталось ввести: {innLength - inn.length}
                          </p>
                        ) : null}

                        {lookupState === "error" && lookupError ? (
                          <p className="rounded-2xl bg-red-50 p-4 text-sm font-black text-red-600 ring-1 ring-red-100">
                            {lookupError}
                          </p>
                        ) : null}

                        {lookupState === "success" && company ? (
                          <div className="company-result-enter rounded-[24px] border border-emerald-200 bg-white p-4 shadow-sm sm:p-5">
                            <div className="flex items-start gap-4">
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
                                <BadgeCheck size={25} />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-lg font-black text-slate-950">
                                    {company.shortName}
                                  </p>
                                  <span className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-black text-white">
                                    Действующая
                                  </span>
                                </div>

                                <p className="mt-1 text-sm font-bold leading-6 text-slate-600">
                                  {company.officialName}
                                </p>

                                <div className="mt-3 flex flex-wrap gap-2 text-xs font-black text-slate-600">
                                  <span className="rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-100">
                                    ИНН {company.inn}
                                  </span>
                                  <span className="rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-100">
                                    ОГРН {company.ogrn}
                                  </span>
                                  {company.kpp ? (
                                    <span className="rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-100">
                                      КПП {company.kpp}
                                    </span>
                                  ) : null}
                                </div>

                                {company.legalAddress ? (
                                  <p className="mt-3 text-sm leading-6 text-slate-500">
                                    {company.legalAddress}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ) : null}

                        <div className="flex gap-3 rounded-2xl bg-white p-4 text-sm font-bold leading-6 text-[#0046cc] ring-1 ring-blue-100">
                          <ShieldCheck
                            className="mt-0.5 shrink-0"
                            size={20}
                          />
                          <p>
                            ИНН подтверждает реквизиты, но не право владения.
                            Профиль ИП или ООО сначала получает статус «На
                            проверке».
                          </p>
                        </div>
                      </div>
                    ) : null}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="relative">
                        <MapPin
                          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                          size={20}
                        />
                        <input
                          className="input w-full"
                          style={{ paddingLeft: "58px" }}
                          placeholder="Город"
                          value={city}
                          onChange={(event) => setCity(event.target.value)}
                          required
                        />
                      </div>

                      <div className="relative">
                        <Phone
                          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                          size={20}
                        />
                        <input
                          className="input w-full"
                          style={{ paddingLeft: "58px" }}
                          inputMode="tel"
                          autoComplete="tel"
                          placeholder="Телефон"
                          value={phone}
                          onChange={(event) => setPhone(event.target.value)}
                          required
                        />
                      </div>
                    </div>
                  </>
                ) : null}

                <div
                  className={`grid gap-4 ${
                    mode === "register" ? "sm:grid-cols-2" : ""
                  }`}
                >
                  <div className="relative">
                    <Mail
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                      size={20}
                    />
                    <input
                      className="input w-full"
                      style={{ paddingLeft: "58px" }}
                      type="email"
                      autoComplete="email"
                      placeholder="Электронная почта"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                  </div>

                  <div className="relative">
                    <Lock
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                      size={20}
                    />
                    <input
                      className="input w-full"
                      style={{ paddingLeft: "58px" }}
                      type="password"
                      minLength={6}
                      autoComplete={
                        mode === "register"
                          ? "new-password"
                          : "current-password"
                      }
                      placeholder="Пароль — минимум 6 символов"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              {error ? (
                <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-black text-red-600 ring-1 ring-red-100">
                  {error}
                </p>
              ) : null}

              <button
                disabled={sending || registrationBlocked}
                className="group mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0057ff] px-5 py-4 text-base font-black text-white shadow-lg shadow-blue-600/20 transition duration-300 hover:-translate-y-1 hover:bg-[#004de6] hover:shadow-[0_18px_40px_rgba(0,87,255,0.28)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 sm:text-lg"
              >
                {sending ? (
                  <Loader2 className="animate-spin" size={21} />
                ) : null}
                {sending
                  ? "Подождите..."
                  : mode === "register"
                  ? "Создать аккаунт"
                  : "Войти"}
              </button>

              <p className="mt-5 text-center text-xs font-bold leading-5 text-slate-400">
                Продолжая, вы подтверждаете согласие с правилами сервиса и
                обработкой персональных данных.
              </p>
            </form>
          </div>
        </section>
      </div>

      <style jsx global>{`
        @keyframes authReveal {
          from {
            opacity: 0;
            transform: translateY(18px) scale(0.99);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes companyResultIn {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .auth-reveal {
          animation: authReveal 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .auth-card {
          animation-delay: 80ms;
        }

        .company-result-enter {
          animation: companyResultIn 320ms ease-out both;
        }

        @media (prefers-reduced-motion: reduce) {
          .auth-reveal,
          .company-result-enter {
            animation: none !important;
          }
        }
      `}</style>
    </main>
  );
}
