import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { StudyProvider } from "@/context/study-context";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Hanzi Flow — китайский каждый день",
  description: "Персональный тренажёр китайских слов, иероглифов и тонов с умными повторениями.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <StudyProvider>
          <AppShell>{children}</AppShell>
        </StudyProvider>
      </body>
    </html>
  );
}
