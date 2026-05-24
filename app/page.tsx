"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, BookOpen, Brain, Calendar, Flame, GraduationCap, ListChecks, Music2, Sparkles, Timer, TrendingUp } from "lucide-react";
import { ImportPanel } from "@/components/import-panel";
import { useStudy } from "@/context/study-context";
import { STAGE_LABELS } from "@/lib/constants";
import { learningStages, type LearningStage } from "@/lib/types";
import { formatDuration } from "@/lib/utils";

const dashboardStages: LearningStage[] = [...learningStages];

const launchCards = [
  {
    href: "/learn",
    eyebrow: "Новый цикл",
    title: "Изучение Hanzi",
    description: "Комплексная цепочка интервального повторения.",
    icon: GraduationCap,
    tone: "sky",
    cta: "Запуск",
  },
  {
    href: "/review",
    eyebrow: "Повторение",
    title: "Интервальный разбор",
    description: "Освежите карточки, которым пора вернуться в память.",
    icon: Brain,
    tone: "amber",
    cta: "Повторить",
  },
  {
    href: "/tones",
    eyebrow: "Фонетика",
    title: "Тренеры тонов",
    description: "Отточите распознавание тональности и похожих слогов.",
    icon: Music2,
    tone: "indigo",
    cta: "Начать",
  },
  {
    href: "/test",
    eyebrow: "Контроль знаний",
    title: "Общее тестирование",
    description: "Проверьте перевод, иероглифы и пиньинь отдельным режимом.",
    icon: ListChecks,
    tone: "emerald",
    cta: "Тест",
  },
] as const;

export default function HomePage() {
  const { hydrated, metrics, stats } = useStudy();

  const summaryCards = [
    { label: "Всего карточек", value: metrics.totalCards, icon: BookOpen, tone: "slate" },
    { label: "Новых", value: metrics.newCount, icon: Sparkles, tone: "sky" },
    { label: "В изучении", value: metrics.learningCount, icon: GraduationCap, tone: "indigo" },
    { label: "В повторении", value: metrics.reviewCount, icon: Brain, tone: "amber" },
    { label: "Освоено", value: metrics.masteredCount, icon: TrendingUp, tone: "emerald" },
    { label: "Повторить сегодня", value: metrics.dueTodayCount, icon: Flame, tone: "rose" },
  ] as const;

  if (!hydrated) {
    return <div className="glass-panel p-8 text-sm muted-text">Инициализирую стартовые данные и локальное хранилище...</div>;
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {launchCards.map((card) => {
          const Icon = card.icon;
          const count =
            card.href === "/learn"
              ? metrics.newCount + metrics.learningCount
              : card.href === "/review"
                ? metrics.dueTodayCount
                : card.href === "/tones"
                  ? metrics.totalCards
                  : metrics.totalCards;

          return (
            <article key={card.href} className={`bento-card tone-${card.tone}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="icon-tile">
                      <Icon size={18} />
                    </span>
                    <span className="meta-label">{card.eyebrow}</span>
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-100">{card.title}</h2>
                    <p className="mt-2 text-[11px] leading-relaxed muted-text">{card.description}</p>
                  </div>
                </div>
                <span className="count-badge">{count}</span>
              </div>
              <Link href={card.href} className="btn-primary mt-5 w-full py-2.5 text-xs">
                {card.cta}
                <ArrowRight size={14} />
              </Link>
            </article>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="glass-panel overflow-hidden p-6 sm:p-7">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <span className="pill w-fit">FSRS Trainer</span>
              <h1 className="mt-5 max-w-3xl text-3xl font-bold leading-tight text-slate-100 sm:text-4xl">
                Китайские иероглифы с поэтапной памятью, повторами и отдельной практикой тонов.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed muted-text">
                Система ведёт карточки через смысл, активное вспоминание и фонетику, а очередь повторения подстраивается
                под ошибки, паузы и текущую уверенность.
              </p>
            </div>

            <div className="progress-orbit" aria-label={`Общий прогресс ${metrics.progressPercent}%`}>
              <svg viewBox="0 0 160 160" className="h-40 w-40 -rotate-90">
                <circle cx="80" cy="80" r="62" className="stroke-slate-800" strokeWidth="12" fill="none" />
                <circle
                  cx="80"
                  cy="80"
                  r="62"
                  className="stroke-sky-500 transition-all duration-1000"
                  strokeWidth="12"
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray="389"
                  strokeDashoffset={389 - (389 * metrics.progressPercent) / 100}
                />
              </svg>
              <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                  <p className="text-3xl font-extrabold text-slate-100">{metrics.progressPercent}%</p>
                  <p className="meta-label mt-1">Усвоено</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="grid gap-4">
          <div className="metric-card">
            <span className="icon-tile tone-sky">
              <Timer size={18} />
            </span>
            <div>
              <p className="meta-label">Сегодня</p>
              <p className="text-lg font-bold text-slate-100">{formatDuration(stats.todayStudyTime)}</p>
            </div>
          </div>
          <div className="metric-card">
            <span className="icon-tile tone-amber">
              <Flame size={18} />
            </span>
            <div>
              <p className="meta-label">Текущая сессия</p>
              <p className="text-lg font-bold text-slate-100">{formatDuration(stats.sessionStudyTime)}</p>
            </div>
          </div>
          <div className="metric-card">
            <span className="icon-tile tone-indigo">
              <Calendar size={18} />
            </span>
            <div>
              <p className="meta-label">Всего времени</p>
              <p className="text-lg font-bold text-slate-100">{formatDuration(stats.totalStudyTime)}</p>
            </div>
          </div>
        </aside>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {summaryCards.map((item, index) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className={`metric-card animate-rise tone-${item.tone}`} style={{ animationDelay: `${index * 50}ms` }}>
              <span className="icon-tile">
                <Icon size={18} />
              </span>
              <div>
                <p className="meta-label">{item.label}</p>
                <p className="metric-value mt-2">{item.value}</p>
              </div>
            </div>
          );
        })}
      </section>

      <section className="glass-panel p-6 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="pill w-fit">
              <BarChart3 size={14} />
              Пайплайн обучения
            </span>
            <h2 className="mt-4 text-2xl font-semibold text-slate-100">Как движутся карточки</h2>
          </div>
          <p className="max-w-2xl text-sm muted-text">
            Карточки двигаются дальше только при стабильных правильных ответах. Ошибки и большие паузы повышают риск
            забывания, а FSRS пересчитывает следующий срок показа.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {dashboardStages.map((stage) => (
            <div key={stage} className="bento-card">
              <p className="text-sm font-semibold text-slate-200">{STAGE_LABELS[stage]}</p>
              <p className="mt-4 text-3xl font-bold text-slate-100">{metrics.stageBreakdown[stage]}</p>
            </div>
          ))}
        </div>
      </section>

      <ImportPanel />
    </div>
  );
}
