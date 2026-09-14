import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Moniq",
  description: "카드 혜택, 전월 실적, 남은 한도를 규칙 기반으로 계산하는 가계부 서비스",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}
