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
  const isCapacitorBuild = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "1";

  return (
    <html
      lang="ru"
      className={isCapacitorBuild ? "android-app" : undefined}
      data-app-shell={isCapacitorBuild ? "android" : "web"}
      suppressHydrationWarning
    >
      <body>
        <StudyProvider>
          <AppShell>{children}</AppShell>
        </StudyProvider>
      </body>
    </html>
  );
}
