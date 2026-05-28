"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  Brain,
  ChevronLeft,
  ChevronRight,
  Compass,
  Flame,
  GraduationCap,
  Library,
  ListChecks,
  Music2,
  Timer,
  TrendingUp,
} from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { AuthPanel } from "@/components/auth-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { useStudy } from "@/context/study-context";
import { ALL_LESSONS_ID, UNASSIGNED_LESSON_ID, UNASSIGNED_LESSON_TITLE } from "@/lib/constants";
import { formatDuration } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  icon: ComponentType<{ size?: number; className?: string }>;
};

const navItems: NavItem[] = [
  { href: "/", label: "Дашборд", shortLabel: "Главная", icon: Compass },
  { href: "/learn", label: "Обучение", shortLabel: "Учить", icon: GraduationCap },
  { href: "/review", label: "Повторение", shortLabel: "Повтор", icon: Brain },
  { href: "/test", label: "Тест", icon: ListChecks },
  { href: "/tones", label: "Тоны", icon: Music2 },
  { href: "/cards", label: "Картотека", shortLabel: "Карточки", icon: BookOpen },
  { href: "/stats", label: "Аналитика", shortLabel: "Статы", icon: TrendingUp },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { authStatus, authUser, availableLessons, cards, hydrated, metrics, selectedLessonId, setSelectedLessonId, stats } = useStudy();

  const dueTodayLabel = hydrated ? String(metrics.dueTodayCount) : "...";
  const progressLabel = hydrated ? `${metrics.progressPercent}%` : "...";
  const sessionLabel = hydrated ? formatDuration(stats.sessionStudyTime) : "...";
  const unassignedCards = cards.filter((card) => card.lessonId === UNASSIGNED_LESSON_ID);
  const lessonOptions = [
    {
      id: ALL_LESSONS_ID,
      title: "Все уроки",
      count: cards.length,
      meta: hydrated ? `${metrics.progressPercent}% освоено · ${metrics.dueTodayCount} к повтору` : "",
    },
    ...(unassignedCards.length > 0
      ? [
          {
            id: UNASSIGNED_LESSON_ID,
            title: UNASSIGNED_LESSON_TITLE,
            count: unassignedCards.length,
            meta: `${unassignedCards.length} карточек`,
          },
        ]
      : []),
    ...availableLessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      count: lesson.count,
      meta: `${lesson.progressPercent}% освоено · ${lesson.reviewCount} к повтору`,
    })),
  ];
  const selectedLessonIndex = Math.max(
    0,
    lessonOptions.findIndex((lesson) => lesson.id === selectedLessonId),
  );
  const selectedLesson = lessonOptions[selectedLessonIndex] ?? lessonOptions[0];

  function changeLesson(direction: -1 | 1) {
    if (lessonOptions.length <= 1) {
      return;
    }

    const nextIndex = (selectedLessonIndex + direction + lessonOptions.length) % lessonOptions.length;
    setSelectedLessonId(lessonOptions[nextIndex].id);
  }

  if (hydrated && authStatus === "unauthenticated") {
    return <AuthPanel />;
  }

  return (
    <div className="app-shell min-h-screen">
      <div className="pointer-events-none fixed inset-0 soft-grid opacity-50" />
      <div className="pointer-events-none fixed left-[18rem] top-[-12rem] h-[34rem] w-[34rem] rounded-full bg-sky-500/5 blur-glow" />
      <div className="pointer-events-none fixed bottom-[-12rem] right-[12rem] h-[30rem] w-[30rem] rounded-full bg-indigo-500/5 blur-glow" />

      <header className="mobile-header app-header sticky top-0 z-40 border-b lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="brand-lockup">
            <span className="brand-mark">漢</span>
            <span>
              <span className="brand-name">Hanzi Flow</span>
              <span className="brand-kicker">FSRS Trainer</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="top-stat hidden sm:inline-flex">
              <Flame size={14} />
              <strong>{dueTodayLabel}</strong>
            </span>
            <ThemeToggle />
          </div>
        </div>
        <div className="px-4 pb-3">
          <AccountMenu />
        </div>
        <nav className="thin-scrollbar overflow-x-auto px-4 pb-3">
          <div className="flex min-w-max items-center gap-2">
            {navItems.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className={["nav-chip", active ? "is-active" : ""].join(" ")}>
                  <Icon size={15} />
                  {item.shortLabel ?? item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <aside className="desktop-sidebar hidden lg:flex">
        <div className="space-y-7">
          <Link href="/" className="brand-lockup px-1">
            <span className="brand-mark">漢</span>
            <span>
              <span className="brand-name">Hanzi Flow</span>
              <span className="brand-kicker">FSRS Trainer</span>
            </span>
          </Link>

          <nav className="grid gap-1.5">
            {navItems.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className={["nav-chip", active ? "is-active" : ""].join(" ")}>
                  <Icon size={16} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="pt-3">
            <AccountMenu />
          </div>
        </div>

        <div className="grid gap-4 border-t border-white/5 pt-5">
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase text-slate-500">
              <span>Локальный режим</span>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-400" />
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="sidebar-stat">
                <Flame size={14} />
                {dueTodayLabel}
              </span>
              <span className="sidebar-stat">
                <BarChart3 size={14} />
                {progressLabel}
              </span>
            </div>
            <span className="sidebar-stat justify-start">
              <Timer size={14} />
              Сессия {sessionLabel}
            </span>
          </div>
          <ThemeToggle />
        </div>
      </aside>

      <main className="app-main">
        <section className="lesson-selector mb-6">
          <div className="lesson-selector-main">
            <div className="lesson-selector-label">
              <Library size={14} />
              <span>Текущий урок</span>
            </div>
            <div className="lesson-select-field">
              <select
                value={selectedLesson?.id ?? ALL_LESSONS_ID}
                disabled={!hydrated}
                className="lesson-select"
                onChange={(event) => setSelectedLessonId(event.target.value)}
              >
                {lessonOptions.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    {lesson.title} · {lesson.count}
                  </option>
                ))}
              </select>
              <p>{hydrated ? selectedLesson?.meta : "Загружаю уроки..."}</p>
            </div>
          </div>
          <div className="lesson-nav-buttons">
            <button type="button" aria-label="Предыдущий урок" disabled={!hydrated} onClick={() => changeLesson(-1)}>
              <ChevronLeft size={16} />
            </button>
            <button type="button" aria-label="Следующий урок" disabled={!hydrated} onClick={() => changeLesson(1)}>
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="lesson-metric-strip">
            <span className="lesson-metric-pill">
              <small>Карточек</small>
              <strong>{hydrated ? metrics.totalCards : "..."}</strong>
            </span>
            <span className="lesson-metric-pill">
              <small>Прогресс</small>
              <strong>{hydrated ? `${metrics.progressPercent}%` : "..."}</strong>
            </span>
            <span className="lesson-metric-pill">
              <small>К повтору</small>
              <strong>{hydrated ? metrics.dueTodayCount : "..."}</strong>
            </span>
          </div>
        </section>

        {children}
      </main>

    </div>
  );
}
