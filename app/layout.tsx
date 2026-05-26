import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { StudyProvider } from "@/context/study-context";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Hanzi Flow",
  description: "Современное приложение для изучения китайских иероглифов с этапами, повторением и forgetting curve.",
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
