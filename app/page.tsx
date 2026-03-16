"use client";

import Link from "next/link";
import { ImportPanel } from "@/components/import-panel";
import { useStudy } from "@/context/study-context";
import { STAGE_LABELS } from "@/lib/constants";
import { learningStages, type LearningStage } from "@/lib/types";
import { formatDuration } from "@/lib/utils";

const dashboardStages: LearningStage[] = [...learningStages];

export default function HomePage() {
  const { hydrated, metrics, stats } = useStudy();

  const summaryCards = [
    { label: "Всего карточек", value: metrics.totalCards },
    { label: "Новых", value: metrics.newCount },
    { label: "В изучении", value: metrics.learningCount },
    { label: "В повторении", value: metrics.reviewCount },
    { label: "Освоено", value: metrics.masteredCount },
    { label: "Повторить сегодня", value: metrics.dueTodayCount },
  ];

  const actionCards = [
    {
      href: "/learn",
      title: "Начать обучение",
      description: "Двухэтапное освоение: сначала смысл, затем обратное вспоминание иероглифа.",
    },
    {
      href: "/review",
      title: "Повторение",
      description: "Очередь по сроку повтора, FSRS и текущему уровню забывания карточек.",
    },
    {
      href: "/test",
      title: "Тест",
      description: "Отдельные режимы проверки на перевод, иероглиф и пиньинь.",
    },
    {
      href: "/tones",
      title: "Тоновые тренировки",
      description: "Мини-режим на различение 1-го, 2-го, 3-го и 4-го тона и похожих слогов.",
    },
    {
      href: "/cards",
      title: "Все карточки",
      description: "Поиск, сортировка, фильтры и диагностика памяти по каждой карточке.",
    },
    {
      href: "/stats",
      title: "Статистика",
      description: "Время обучения, серия дней, активность по неделе и общий прогресс.",
    },
  ];

  if (!hydrated) {
    return <div className="glass-panel p-8 text-sm muted-text">Инициализирую стартовые данные и локальное хранилище…</div>;
  }

  return (
    <div className="grid gap-6">
      <section className="glass-panel overflow-hidden p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div className="space-y-5">
            <span className="pill w-fit">Учебная система</span>
            <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">
              Китайские иероглифы с поэтапным освоением, FSRS-повторами и отдельной практикой тонов.
            </h1>
            <p className="max-w-3xl text-base muted-text">
              Приложение не крутит карточки случайно. Сначала мы закрепляем смысл, затем вспоминаем иероглиф по переводу,
              а чтение и тоны выносим в отдельные режимы практики, чтобы не перегружать основной цикл обучения.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/learn" className="btn-primary">
                Начать обучение
              </Link>
              <Link href="/review" className="btn-secondary">
                Повторение
              </Link>
              <Link href="/test" className="btn-secondary">
                Тест
              </Link>
              <Link href="/tones" className="btn-secondary">
                Тоны
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[30px] border border-white/10 bg-[rgba(var(--accent),0.12)] p-5">
              <p className="subtle-text text-xs uppercase tracking-[0.18em]">Общий прогресс</p>
              <p className="mt-4 metric-value">{metrics.progressPercent}%</p>
            </div>
            <div className="rounded-[30px] border border-white/10 bg-white/5 p-5">
              <p className="subtle-text text-xs uppercase tracking-[0.18em]">Текущая сессия</p>
              <p className="mt-4 metric-value">{formatDuration(stats.sessionStudyTime)}</p>
            </div>
            <div className="rounded-[30px] border border-white/10 bg-white/5 p-5">
              <p className="subtle-text text-xs uppercase tracking-[0.18em]">Сегодня</p>
              <p className="mt-4 metric-value">{formatDuration(stats.todayStudyTime)}</p>
            </div>
            <div className="rounded-[30px] border border-white/10 bg-white/5 p-5">
              <p className="subtle-text text-xs uppercase tracking-[0.18em]">Всего времени</p>
              <p className="mt-4 metric-value">{formatDuration(stats.totalStudyTime)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {summaryCards.map((item, index) => (
          <div
            key={item.label}
            className="glass-panel animate-rise p-5"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <p className="subtle-text text-xs uppercase tracking-[0.18em]">{item.label}</p>
            <p className="mt-4 metric-value">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="glass-panel p-6 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="pill w-fit">Пайплайн обучения</span>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">Как движутся карточки</h2>
          </div>
          <p className="max-w-2xl text-sm muted-text">
            Карточки двигаются дальше только при стабильных правильных ответах. Ошибки и большие паузы в повторении
            повышают риск забывания, а FSRS пересчитывает следующий срок показа и возвращает карточку в более частую практику.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {dashboardStages.map((stage) => (
            <div key={stage} className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-semibold">{STAGE_LABELS[stage]}</p>
              <p className="mt-4 text-3xl font-semibold tracking-[-0.04em]">{metrics.stageBreakdown[stage]}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {actionCards.map((action) => (
          <Link key={action.href} href={action.href} className="glass-panel p-5 transition hover:-translate-y-1">
            <p className="text-lg font-semibold">{action.title}</p>
            <p className="mt-3 text-sm muted-text">{action.description}</p>
          </Link>
        ))}
      </section>

      <ImportPanel />
    </div>
  );
}