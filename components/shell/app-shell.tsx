"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useStudy } from "@/context/study-context";
import { ALL_LESSONS_ID, UNASSIGNED_LESSON_ID, UNASSIGNED_LESSON_TITLE } from "@/lib/constants";
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
  const lessonScrollerRef = useRef<HTMLDivElement | null>(null);
  const { availableLessons, cards, hydrated, metrics, selectedLessonId, setSelectedLessonId, stats } = useStudy();

  const dueTodayLabel = hydrated ? String(metrics.dueTodayCount) : "…";
  const progressLabel = hydrated ? `${metrics.progressPercent}%` : "…";
  const sessionLabel = hydrated ? formatDuration(stats.sessionStudyTime) : "…";
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
    <div className="min-h-screen">
      <div className="pointer-events-none fixed inset-0 soft-grid opacity-40" />

      <header className="app-header sticky top-0 z-30">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-2">
              <Link href="/" className="text-xl font-semibold tracking-[-0.04em]">
                Hanzi Flow
              </Link>
              <p className="hidden max-w-2xl text-xs muted-text md:block">
                Поэтапная система изучения китайских иероглифов с forgetting curve, повторением, таймингом сессий и
                отдельными тренировками на тоны.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="top-stat">
                Повторить сегодня
                <strong>{dueTodayLabel}</strong>
              </span>
              <span className="top-stat">
                Прогресс
                <strong>{progressLabel}</strong>
              </span>
              <span className="top-stat">
                Сессия
                <strong>{sessionLabel}</strong>
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
                    className={["nav-chip", active ? "is-active" : ""].join(" ")}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>

          <section className="lesson-rail">
            <div className="shrink-0 px-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] subtle-text">Уроки</p>
            </div>
            <button
              type="button"
              className="lesson-scroll-button"
              aria-label="Прокрутить уроки влево"
              onClick={() => scrollLessons(-1)}
            >
              {"<"}
            </button>
            <div ref={lessonScrollerRef} className="thin-scrollbar lesson-scroller">
              <button
                type="button"
                disabled={!hydrated}
                className={["lesson-chip", allLessonsActive ? "is-active" : ""].join(" ")}
                onClick={() => setSelectedLessonId(ALL_LESSONS_ID)}
              >
                Все уроки
                <strong>{hydrated ? cards.length : "…"}</strong>
                <small>{hydrated ? `${metrics.progressPercent}% · ${metrics.dueTodayCount} к повтору` : ""}</small>
              </button>
              <button
                type="button"
                disabled={!hydrated || unassignedCards.length === 0}
                className={["lesson-chip", unassignedActive ? "is-active" : ""].join(" ")}
                onClick={() => setSelectedLessonId(UNASSIGNED_LESSON_ID)}
              >
                {UNASSIGNED_LESSON_TITLE}
                <strong>{hydrated ? unassignedCards.length : "вЂ¦"}</strong>
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
              {">"}
            </button>
          </section>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
