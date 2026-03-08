"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useStudy } from "@/context/study-context";
import { formatDuration } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Главная" },
  { href: "/learn", label: "Обучение" },
  { href: "/review", label: "Повторение" },
  { href: "/test", label: "Тест" },
  { href: "/tones", label: "Тоны" },
  { href: "/cards", label: "Карточки" },
  { href: "/stats", label: "Статистика" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { metrics, stats } = useStudy();

  return (
    <div className="min-h-screen">
      <div className="pointer-events-none fixed inset-0 soft-grid opacity-40" />

      <header className="sticky top-0 z-30 border-b border-white/10 bg-[rgba(var(--background),0.72)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-2">
              <Link href="/" className="text-xl font-semibold tracking-[-0.04em]">
                Hanzi Flow
              </Link>
              <p className="max-w-2xl text-sm muted-text">
                Поэтапная система изучения китайских иероглифов с forgetting curve, повторением, таймингом сессий и
                отдельными тренировками на тоны.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="pill">
                Повторить сегодня
                <strong>{metrics.dueTodayCount}</strong>
              </span>
              <span className="pill">
                Прогресс
                <strong>{metrics.progressPercent}%</strong>
              </span>
              <span className="pill">
                Сессия
                <strong>{formatDuration(stats.sessionStudyTime)}</strong>
              </span>
              <ThemeToggle />
            </div>
          </div>

          <nav className="thin-scrollbar overflow-x-auto">
            <div className="flex min-w-max items-center gap-2 pb-1">
              {navItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      "rounded-full px-4 py-2 text-sm font-medium transition",
                      active
                        ? "bg-[rgba(var(--accent),0.18)] text-[rgb(var(--accent))]"
                        : "text-[rgba(var(--foreground),0.72)] hover:bg-white/5 hover:text-[rgb(var(--foreground))]",
                    ].join(" ")}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
