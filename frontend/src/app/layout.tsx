import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 코딩 콘솔",
  description: "AI 기반 코딩 관측 대시보드",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
