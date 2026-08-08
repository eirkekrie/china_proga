"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import {
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  ChevronRight,
  Circle,
  Clock3,
  Flame,
  GraduationCap,
  Headphones,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { LessonPicker } from "@/components/lesson-picker";
import { useStudy } from "@/context/study-context";
import { ALL_LESSONS_ID } from "@/lib/constants";
import { formatDuration } from "@/lib/utils";

const DAILY_GOAL_MS = 15 * 60 * 1000;

function pluralizeCards(value: number) {
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "карточек";
  if (last === 1) return "карточка";
  if (last >= 2 && last <= 4) return "карточки";
  return "карточек";
}

export default function HomePage() {
  const { availableLessons, hydrated, metrics, selectedLessonId, stats } = useStudy();

  if (!hydrated) {
    return <div className="today-skeleton" aria-label="Загрузка" />;
  }

  const lessonTitle =
    selectedLessonId === ALL_LESSONS_ID
      ? "Все уроки"
      : availableLessons.find((lesson) => lesson.id === selectedLessonId)?.title ?? "Без урока";
  const accuracy = stats.totalReviews > 0 ? Math.round((stats.totalCorrect / stats.totalReviews) * 100) : 0;
  const dailyProgress = Math.min(100, Math.round((stats.todayStudyTime / DAILY_GOAL_MS) * 100));
  const hasReviews = metrics.dueTodayCount > 0;
  const primaryHref = hasReviews ? "/review" : "/learn";
  const primaryLabel = hasReviews ? "Начать повторение" : "Учить новые слова";
  const dateLabel = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <div className="today-page">
      <div className="today-topline">
        <div>
          <p className="today-date">{dateLabel}</p>
          <h1>Что учим сегодня?</h1>
          <p>Короткая сессия важнее идеального плана. Начни с того, что уже пора повторить.</p>
        </div>
        <LessonPicker compact />
      </div>

      <section className="today-hero">
        <div className="today-hero-copy">
          <span className="today-kicker">
            <Target size={15} />
            План на сегодня
          </span>
          <h2>
            {hasReviews
              ? `${metrics.dueTodayCount} ${pluralizeCards(metrics.dueTodayCount)} ждут повторения`
              : "Повторы закончены — можно двигаться дальше"}
          </h2>
          <p>
            {hasReviews
              ? "Сначала верни в активную память знакомые слова, затем добавь немного нового материала."
              : "Возьми несколько новых слов или закрепи произношение в тренировке тонов."}
          </p>
          <div className="today-hero-actions">
            <Link href={primaryHref} className="btn-primary today-primary-action">
              {primaryLabel}
              <ArrowRight size={18} />
            </Link>
            {hasReviews && metrics.newCount > 0 ? (
              <Link href="/learn" className="btn-ghost">
                Учить новое
              </Link>
            ) : null}
          </div>
        </div>

        <div className="daily-goal" aria-label={`Дневная цель выполнена на ${dailyProgress}%`}>
          <div className="daily-goal-ring" style={{ "--goal-progress": `${dailyProgress * 3.6}deg` } as CSSProperties}>
            <div>
              <strong>{dailyProgress}%</strong>
              <span>из 15 минут</span>
            </div>
          </div>
          <p>{stats.todayStudyTime > 0 ? `${formatDuration(stats.todayStudyTime)} сегодня` : "Начни первую сессию"}</p>
        </div>
      </section>

      <section className="today-grid">
        <div className="today-plan-panel">
          <div className="section-heading">
            <div>
              <span>Маршрут</span>
              <h2>Три небольших шага</h2>
            </div>
            <span className="plan-duration">
              <Clock3 size={15} /> ≈ 15 минут
            </span>
          </div>

          <div className="plan-steps">
            <Link href="/review" className={metrics.dueTodayCount > 0 ? "plan-step is-primary" : "plan-step is-done"}>
              <span className="plan-step-state">{metrics.dueTodayCount > 0 ? <Circle size={18} /> : <Check size={18} />}</span>
              <span className="plan-step-icon"><Brain size={20} /></span>
              <span className="plan-step-copy">
                <small>Сначала</small>
                <strong>Повторить изученное</strong>
                <span>{metrics.dueTodayCount > 0 ? `${metrics.dueTodayCount} карточек по расписанию` : "На сегодня всё готово"}</span>
              </span>
              <ChevronRight size={18} />
            </Link>

            <Link href="/learn" className="plan-step">
              <span className="plan-step-state"><Circle size={18} /></span>
              <span className="plan-step-icon"><GraduationCap size={20} /></span>
              <span className="plan-step-copy">
                <small>Затем</small>
                <strong>Добавить новое</strong>
                <span>{Math.min(5, metrics.newCount)} из {metrics.newCount} новых карточек</span>
              </span>
              <ChevronRight size={18} />
            </Link>

            <Link href="/tones" className="plan-step">
              <span className="plan-step-state"><Circle size={18} /></span>
              <span className="plan-step-icon"><Headphones size={20} /></span>
              <span className="plan-step-copy">
                <small>В конце</small>
                <strong>Размять слух</strong>
                <span>5 вопросов на различение тонов</span>
              </span>
              <ChevronRight size={18} />
            </Link>
          </div>
        </div>

        <aside className="today-summary-panel">
          <div className="section-heading">
            <div>
              <span>{lessonTitle}</span>
              <h2>Твой прогресс</h2>
            </div>
            <Link href="/stats" aria-label="Открыть статистику"><ArrowRight size={18} /></Link>
          </div>
          <div className="summary-progress">
            <div className="summary-progress-row">
              <span>Освоено</span>
              <strong>{metrics.progressPercent}%</strong>
            </div>
            <div className="progress-track"><span style={{ width: `${metrics.progressPercent}%` }} /></div>
          </div>
          <div className="summary-metrics">
            <div>
              <span className="summary-icon tone-amber"><Flame size={17} /></span>
              <strong>{stats.streakDays}</strong>
              <small>дней подряд</small>
            </div>
            <div>
              <span className="summary-icon tone-emerald"><TrendingUp size={17} /></span>
              <strong>{accuracy}%</strong>
              <small>верных ответов</small>
            </div>
            <div>
              <span className="summary-icon tone-sky"><Sparkles size={17} /></span>
              <strong>{metrics.masteredCount}</strong>
              <small>освоено</small>
            </div>
          </div>
          <Link href="/cards" className="library-link">
            <BookOpen size={17} />
            <span>
              <strong>Моя библиотека</strong>
              <small>{metrics.totalCards} карточек в выбранном наборе</small>
            </span>
            <ChevronRight size={17} />
          </Link>
        </aside>
      </section>
    </div>
  );
}
