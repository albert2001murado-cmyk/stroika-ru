import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import Header from "@/components/Header";
import Link from "next/link";


export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#0057ff",
};

export const metadata: Metadata = {
  title: "Стройка.ру — строительные услуги",
  description: "Доска объявлений для строительных услуг, ремонта и спецтехники.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        <AuthProvider>
          <Header />
          {children}
          <footer className="border-t border-slate-200 bg-white px-4 py-6 text-xs text-slate-500 sm:py-8 sm:text-sm">
            <div className="mx-auto grid max-w-7xl grid-cols-2 gap-2 font-bold sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-5 sm:gap-y-3">
              <Link href="/terms" className="rounded-xl px-2 py-2 text-center transition hover:bg-blue-50 hover:text-[#0057ff] sm:px-0 sm:py-0">Пользовательское соглашение</Link>
              <Link href="/platform-rules" className="rounded-xl px-2 py-2 text-center transition hover:bg-blue-50 hover:text-[#0057ff] sm:px-0 sm:py-0">Правила платформы</Link>
              <Link href="/publication-rules" className="rounded-xl px-2 py-2 text-center transition hover:bg-blue-50 hover:text-[#0057ff] sm:px-0 sm:py-0">Правила публикации</Link>
              <Link href="/privacy" className="rounded-xl px-2 py-2 text-center transition hover:bg-blue-50 hover:text-[#0057ff] sm:px-0 sm:py-0">Конфиденциальность</Link>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
