"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
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
  const lessonScrollerRef = useRef<HTMLDivElement | null>(null);
  const { availableLessons, cards, hydrated, metrics, selectedLessonId, setSelectedLessonId, stats } = useStudy();

  const dueTodayLabel = hydrated ? String(metrics.dueTodayCount) : "...";
  const progressLabel = hydrated ? `${metrics.progressPercent}%` : "...";
  const sessionLabel = hydrated ? formatDuration(stats.sessionStudyTime) : "...";
  const allLessonsActive = selectedLessonId === ALL_LESSONS_ID;
  const unassignedCards = cards.filter((card) => card.lessonId === UNASSIGNED_LESSON_ID);
  const unassignedActive = selectedLessonId === UNASSIGNED_LESSON_ID;
  function scrollLessons(direction: -1 | 1) {
    lessonScrollerRef.current?.scrollBy({
      left: direction * 360,
      behavior: "smooth",
    });
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
        <section className="lesson-rail mb-6">
          <div className="lesson-rail-label">
            <Library size={14} />
            <span>Уроки</span>
          </div>
          <button
            type="button"
            className="lesson-scroll-button"
            aria-label="Прокрутить уроки влево"
            onClick={() => scrollLessons(-1)}
          >
            <ChevronLeft size={16} />
          </button>
          <div ref={lessonScrollerRef} className="thin-scrollbar lesson-scroller">
            <button
              type="button"
              disabled={!hydrated}
              className={["lesson-chip", allLessonsActive ? "is-active" : ""].join(" ")}
              onClick={() => setSelectedLessonId(ALL_LESSONS_ID)}
            >
              Все уроки
              <strong>{hydrated ? cards.length : "..."}</strong>
              <small>{hydrated ? `${metrics.progressPercent}% · ${metrics.dueTodayCount} к повтору` : ""}</small>
            </button>
            <button
              type="button"
              disabled={!hydrated || unassignedCards.length === 0}
              className={["lesson-chip", unassignedActive ? "is-active" : ""].join(" ")}
              onClick={() => setSelectedLessonId(UNASSIGNED_LESSON_ID)}
            >
              {UNASSIGNED_LESSON_TITLE}
              <strong>{hydrated ? unassignedCards.length : "..."}</strong>
              <small>{hydrated ? `${unassignedCards.length} карточек` : ""}</small>
            </button>
            {availableLessons.map((lesson) => (
              <button
                key={lesson.id}
                type="button"
                disabled={!hydrated}
                className={["lesson-chip", selectedLessonId === lesson.id ? "is-active" : ""].join(" ")}
                onClick={() => setSelectedLessonId(lesson.id)}
              >
                {lesson.title}
                <strong>{lesson.count}</strong>
                <small>
                  {lesson.progressPercent}% · {lesson.newCount} новых · {lesson.reviewCount} к повтору
                </small>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="lesson-scroll-button"
            aria-label="Прокрутить уроки вправо"
            onClick={() => scrollLessons(1)}
          >
            <ChevronRight size={16} />
          </button>
        </section>

        {children}
      </main>

    </div>
  );
}
