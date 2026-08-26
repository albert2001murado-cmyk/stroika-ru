"use client";

import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import {
  BadgeCheck,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardList,
  GitCompareArrows,
  HardHat,
  Headphones,
  Heart,
  Home,
  LogOut,
  Menu,
  MessageCircle,
  Navigation,
  Plus,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import VerifiedBadge from "./VerifiedBadge";

const menuItems = [
  { href: "/favorites", label: "Избранное", icon: Heart },
  { href: "/portfolio", label: "Портфолио", icon: BriefcaseBusiness },
  { href: "/availability", label: "Календарь", icon: CalendarDays },
  { href: "/analytics", label: "Статистика", icon: BarChart3 },
  { href: "/compare", label: "Сравнение", icon: GitCompareArrows },
  { href: "/nearby", label: "Рядом", icon: Navigation },
  { href: "/verification", label: "Проверка", icon: BadgeCheck },
  { href: "/support", label: "Поддержка", icon: Headphones },
];

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [publicationMenuOpen, setPublicationMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const authContext = useAuth() as any;

  const user = authContext?.user || null;
  const profile = authContext?.profile || null;

  const isVerified = Boolean(
    profile?.verified || profile?.isVerified || profile?.verificationStatus === "approved"
  );

  const displayName =
    profile?.displayName ||
    profile?.name ||
    user?.displayName ||
    user?.email?.split("@")?.[0] ||
    "Профиль";

  const accountLabel =
    profile?.accountType === "ooo"
      ? "ООО"
      : profile?.accountType === "ip"
        ? "ИП"
        : "Физлицо";

  const avatarUrl = profile?.avatarUrl || user?.photoURL || "";

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const shouldLock = mobileMenuOpen || publicationMenuOpen;
    if (!shouldLock) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileMenuOpen, publicationMenuOpen]);

  async function handleLogout() {
    await signOut(auth);
    setMobileMenuOpen(false);
    router.push("/");
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function handleHomeLogoClick(event: MouseEvent<HTMLAnchorElement>) {
    if (pathname !== "/") return;
    event.preventDefault();
    window.location.reload();
  }

  function mobileNavClass(href: string) {
    return `mobile-nav-item ${isActive(href) ? "mobile-nav-item-active" : ""}`;
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0057ff] text-white shadow-xl shadow-blue-950/10">
        {/* Полная шапка для компьютера */}
        <div className="hidden h-[82px] w-full items-center justify-between gap-4 px-3 lg:flex lg:px-4">
          <Link
            href="/"
            onClick={handleHomeLogoClick}
            className="flex min-w-[300px] shrink-0 items-center gap-3"
            aria-label="Стройка.ру — обновить главную"
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-[#0057ff] shadow-lg shadow-blue-500/20">
              <HardHat size={30} strokeWidth={2.8} />
            </div>

            <div className="flex min-w-0 flex-col">
              <span className="whitespace-nowrap text-3xl font-black leading-none tracking-tight text-white">
                Стройка.ру
              </span>
              <span className="mt-1 whitespace-nowrap text-sm font-extrabold leading-none text-blue-100">
                все для стройки в одном месте
              </span>
            </div>
          </Link>

          <nav className="flex flex-1 items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setPublicationMenuOpen(true)}
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white px-5 text-sm font-black text-[#0057ff] shadow-lg shadow-blue-950/10 transition duration-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-blue-50 active:scale-[0.97]"
            >
              <Plus size={18} strokeWidth={2.8} />
              Разместить
            </button>

            <Link href="/favorites" className="header-desktop-link">
              <Heart size={18} strokeWidth={2.8} />
              Избранное
            </Link>

            <Link href="/messages" className="header-desktop-link">
              <MessageCircle size={18} strokeWidth={2.8} />
              Сообщения
            </Link>

            <Link href="/portfolio" className="header-desktop-link px-4">
              <BriefcaseBusiness size={18} />
              Портфолио
            </Link>

            <Link href="/requests" className="header-desktop-link px-4">
              <ClipboardList size={18} />
              Заявки
            </Link>

            <Link href="/verification" className="header-desktop-link">
              <BadgeCheck size={18} strokeWidth={2.8} />
              Проверка
            </Link>

            <Link
              href="/support"
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white px-5 text-sm font-black text-[#0057ff] shadow-lg shadow-blue-950/10 transition hover:-translate-y-0.5 hover:bg-blue-50"
            >
              <Headphones size={18} strokeWidth={2.8} />
              Поддержка
            </Link>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            {user ? (
              <>
                <Link
                  href="/profile"
                  className="flex h-14 max-w-[220px] items-center gap-3 rounded-2xl bg-white/10 px-3 text-white ring-1 ring-white/10 transition hover:bg-white/20"
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-white/20"
                    />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15">
                      <UserRound size={20} />
                    </span>
                  )}

                  <span className="hidden min-w-0 text-left leading-tight xl:block">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-black">{displayName}</span>
                      {isVerified ? <ShieldCheck className="shrink-0 text-white" size={16} /> : null}
                    </span>

                    <span className="mt-0.5 flex items-center gap-1.5">
                      <span className="truncate text-xs font-bold text-blue-100">{accountLabel}</span>
                      {isVerified ? <VerifiedBadge size="sm" className="hidden 2xl:inline-flex" /> : null}
                    </span>
                  </span>
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="hidden h-12 items-center gap-2 rounded-2xl bg-white/10 px-4 text-sm font-black text-white ring-1 ring-white/10 transition hover:bg-white/20 2xl:inline-flex"
                >
                  <LogOut size={18} />
                  Выйти
                </button>
              </>
            ) : (
              <Link
                href="/auth"
                className="inline-flex h-12 items-center rounded-2xl bg-white px-5 text-sm font-black text-[#0057ff] shadow-lg shadow-blue-950/10 transition hover:-translate-y-0.5 hover:bg-blue-50"
              >
                Войти
              </Link>
            )}
          </div>
        </div>

        {/* Компактная шапка для телефона и планшета */}
        <div className="flex h-16 items-center justify-between gap-3 px-3 lg:hidden">
          <Link
            href="/"
            onClick={handleHomeLogoClick}
            className="flex min-w-0 items-center gap-2.5"
            aria-label="Стройка.ру — обновить главную"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-white text-[#0057ff] shadow-lg shadow-blue-950/10">
              <HardHat size={23} strokeWidth={2.8} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xl font-black leading-none tracking-tight">Стройка.ру</span>
              <span className="mt-1 block truncate text-[10px] font-extrabold leading-none text-blue-100 sm:text-xs">
                всё для стройки
              </span>
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/messages"
              aria-label="Сообщения"
              className={`mobile-header-button ${isActive("/messages") ? "bg-white text-[#0057ff]" : "bg-white/12 text-white"}`}
            >
              <MessageCircle size={20} strokeWidth={2.5} />
            </Link>

            <Link
              href={user ? "/profile" : "/auth"}
              aria-label={user ? "Профиль" : "Войти"}
              className="mobile-header-button overflow-hidden bg-white/12 text-white"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                <UserRound size={20} strokeWidth={2.5} />
              )}
            </Link>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Открыть меню"
              aria-expanded={mobileMenuOpen}
              className="mobile-header-button bg-white text-[#0057ff]"
            >
              <Menu size={22} strokeWidth={2.7} />
            </button>
          </div>
        </div>
      </header>

      {/* Нижняя навигация мобильной версии */}
      <nav className="mobile-bottom-nav lg:hidden" aria-label="Основная навигация">
        <Link href="/" className={mobileNavClass("/")}>
          <Home size={21} strokeWidth={2.5} />
          <span>Главная</span>
        </Link>

        <Link href="/requests" className={mobileNavClass("/requests")}>
          <ClipboardList size={21} strokeWidth={2.5} />
          <span>Заявки</span>
        </Link>

        <button
          type="button"
          onClick={() => setPublicationMenuOpen(true)}
          className="mobile-publish-button"
          aria-label="Разместить публикацию"
        >
          <span><Plus size={27} strokeWidth={3} /></span>
          <small>Разместить</small>
        </button>

        <Link href="/messages" className={mobileNavClass("/messages")}>
          <MessageCircle size={21} strokeWidth={2.5} />
          <span>Сообщения</span>
        </Link>

        <Link href={user ? "/profile" : "/auth"} className={mobileNavClass(user ? "/profile" : "/auth")}>
          <UserRound size={21} strokeWidth={2.5} />
          <span>{user ? "Профиль" : "Войти"}</span>
        </Link>
      </nav>

      {/* Выезжающее мобильное меню */}
      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-[110] lg:hidden" role="dialog" aria-modal="true" aria-label="Меню сайта">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
            aria-label="Закрыть меню"
            onClick={() => setMobileMenuOpen(false)}
          />

          <aside className="mobile-menu-panel absolute inset-y-0 right-0 flex w-[min(92vw,410px)] flex-col overflow-y-auto bg-[#f5f7fb] shadow-2xl">
            <div className="bg-[#0057ff] px-4 pb-5 pt-[max(16px,env(safe-area-inset-top))] text-white">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/15 ring-1 ring-white/20">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                    ) : (
                      <UserRound size={24} />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-base font-black">{user ? displayName : "Гость"}</span>
                      {isVerified ? <ShieldCheck size={16} className="shrink-0" /> : null}
                    </span>
                    <span className="mt-1 block truncate text-xs font-bold text-blue-100">
                      {user ? accountLabel : "Войдите, чтобы писать и публиковать"}
                    </span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Закрыть"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/12 transition active:scale-90"
                >
                  <X size={22} />
                </button>
              </div>

              <Link
                href={user ? "/profile" : "/auth"}
                className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-[#0057ff] shadow-lg shadow-blue-950/10"
              >
                <UserRound size={18} />
                {user ? "Открыть профиль" : "Войти или зарегистрироваться"}
              </Link>
            </div>

            <div className="flex-1 p-4">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setPublicationMenuOpen(true);
                }}
                className="flex w-full items-center justify-between rounded-[24px] bg-[#0057ff] p-4 text-left text-white shadow-xl shadow-blue-500/20 active:scale-[0.98]"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
                    <Plus size={23} strokeWidth={3} />
                  </span>
                  <span>
                    <span className="block text-base font-black">Разместить</span>
                    <span className="mt-0.5 block text-xs font-bold text-blue-100">Анкету или заявку</span>
                  </span>
                </span>
              </button>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex min-h-[92px] flex-col justify-between rounded-[22px] border p-3.5 transition active:scale-[0.97] ${
                        isActive(item.href)
                          ? "border-blue-200 bg-blue-50 text-[#0057ff]"
                          : "border-slate-100 bg-white text-slate-800"
                      }`}
                    >
                      <Icon size={22} className={isActive(item.href) ? "text-[#0057ff]" : "text-slate-400"} />
                      <span className="text-sm font-black">{item.label}</span>
                    </Link>
                  );
                })}
              </div>

              {user ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-red-50 px-4 text-sm font-black text-red-600 ring-1 ring-red-100 active:scale-[0.98]"
                >
                  <LogOut size={18} />
                  Выйти из аккаунта
                </button>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}

      {/* Выбор типа публикации для обеих версий */}
      {publicationMenuOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/55 px-0 backdrop-blur-sm sm:items-center sm:px-4 sm:py-8"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setPublicationMenuOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="publication-menu-title"
            className="publication-sheet w-full max-w-2xl overflow-hidden rounded-t-[30px] bg-white p-4 pb-[max(20px,env(safe-area-inset-bottom))] text-gray-950 shadow-2xl ring-1 ring-white/40 sm:rounded-[34px] sm:p-8"
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0057ff] sm:text-sm">
                  Стройка.ру
                </p>
                <h2 id="publication-menu-title" className="mt-2 text-2xl font-black sm:text-4xl">
                  Что разместить?
                </h2>
                <p className="mt-2 text-sm font-bold text-gray-500 sm:text-base">
                  Выбери нужный тип публикации.
                </p>
              </div>

              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setPublicationMenuOpen(false)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-700 transition duration-300 hover:rotate-90 hover:bg-gray-200 active:scale-90 sm:h-12 sm:w-12"
              >
                <X size={23} />
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:mt-7 sm:grid-cols-2 sm:gap-4">
              <Link
                href="/post/new"
                onClick={() => setPublicationMenuOpen(false)}
                className="group relative overflow-hidden rounded-[24px] border border-blue-100 bg-blue-50/70 p-4 transition duration-300 hover:-translate-y-1 hover:border-blue-300 hover:bg-blue-50 hover:shadow-xl active:scale-[0.98] sm:rounded-[28px] sm:p-5"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0057ff] text-white shadow-lg shadow-blue-600/20 transition duration-300 group-hover:rotate-[-5deg] group-hover:scale-110 sm:h-14 sm:w-14">
                  <HardHat size={26} />
                </span>
                <h3 className="mt-4 text-xl font-black sm:mt-5 sm:text-2xl">Анкету исполнителя</h3>
                <p className="mt-1.5 text-sm leading-5 text-gray-500 sm:mt-2 sm:leading-6">
                  Предложить услуги, материалы или спецтехнику.
                </p>
                <span className="mt-3 inline-flex items-center gap-2 text-sm font-black text-[#0057ff] sm:mt-5">
                  Перейти <Plus className="transition group-hover:rotate-90" size={18} />
                </span>
              </Link>

              <Link
                href="/requests/new"
                onClick={() => setPublicationMenuOpen(false)}
                className="group relative overflow-hidden rounded-[24px] border border-blue-100 bg-white p-4 transition duration-300 hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl active:scale-[0.98] sm:rounded-[28px] sm:p-5"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg transition duration-300 group-hover:rotate-[5deg] group-hover:scale-110 sm:h-14 sm:w-14">
                  <ClipboardList size={26} />
                </span>
                <h3 className="mt-4 text-xl font-black sm:mt-5 sm:text-2xl">Заявку заказчика</h3>
                <p className="mt-1.5 text-sm leading-5 text-gray-500 sm:mt-2 sm:leading-6">
                  Описать задачу, бюджет, сроки и получить отклики.
                </p>
                <span className="mt-3 inline-flex items-center gap-2 text-sm font-black text-[#0057ff] sm:mt-5">
                  Перейти <Plus className="transition group-hover:rotate-90" size={18} />
                </span>
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
