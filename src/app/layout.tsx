import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import  Header  from "@/components/Header";

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
        </AuthProvider>
      </body>
    </html>
  );
}
