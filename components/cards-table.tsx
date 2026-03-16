"use client";

import { useDeferredValue, useState } from "react";
import { STAGE_LABELS, STATUS_LABELS } from "@/lib/constants";
import { getEffectiveCardState } from "@/lib/learning";
import { useStudy } from "@/context/study-context";
import { formatDateTime, formatDuration } from "@/lib/utils";
import type { CardStatus, LearningStage } from "@/lib/types";

type FilterValue = "all" | CardStatus | "hard";
type SortValue = "due" | "forgetting" | "memory" | "time" | "alphabetical";

export function CardsTable() {
  const { cards, hydrated } = useStudy();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterValue>("all");
  const [stageFilter, setStageFilter] = useState<LearningStage | "all">("all");
  const [sortBy, setSortBy] = useState<SortValue>("due");
  const deferredSearch = useDeferredValue(search);

  if (!hydrated) {
    return <div className="glass-panel p-8 text-sm muted-text">Загружаю карточки…</div>;
  }

  const visibleCards = cards
    .map((card) => getEffectiveCardState(card))
    .filter((card) => {
      const needle = deferredSearch.trim().toLowerCase();
      const matchesSearch =
        !needle ||
        card.hanzi.toLowerCase().includes(needle) ||
        card.pinyin.toLowerCase().includes(needle) ||
        card.translation.toLowerCase().includes(needle);

      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "hard"
            ? card.mistakes >= 3 || card.effectiveForgettingScore >= 70
            : card.computedStatus === statusFilter || card.status === statusFilter;

      const matchesStage = stageFilter === "all" ? true : card.currentStage === stageFilter;

      return matchesSearch && matchesStatus && matchesStage;
    })
    .sort((left, right) => {
      switch (sortBy) {
        case "forgetting":
          return right.effectiveForgettingScore - left.effectiveForgettingScore;
        case "memory":
          return right.effectiveMemoryStrength - left.effectiveMemoryStrength;
        case "time":
          return right.totalTimeSpent - left.totalTimeSpent;
        case "alphabetical":
          return left.hanzi.localeCompare(right.hanzi, "zh-CN");
        default:
          return right.isDue === left.isDue
            ? right.effectiveForgettingScore - left.effectiveForgettingScore
            : Number(right.isDue) - Number(left.isDue);
      }
    });

  return (
    <div className="grid gap-6">
      <section className="glass-panel p-6 sm:p-7">
        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr_0.7fr_0.7fr]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по иероглифу, пиньиню или переводу"
            className="rounded-[22px] border border-white/10 bg-black/10 px-4 py-3 outline-none transition focus:border-[rgba(var(--accent),0.45)] focus:ring-2 focus:ring-[rgba(var(--accent),0.16)]"
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as FilterValue)}
            className="rounded-[22px] border border-white/10 bg-black/10 px-4 py-3 outline-none"
          >
            <option value="all">Все статусы</option>
            <option value="new">Новые</option>
            <option value="learning">В изучении</option>
            <option value="review">В повторении</option>
            <option value="mastered">Освоенные</option>
            <option value="hard">Трудные</option>
          </select>

          <select
            value={stageFilter}
            onChange={(event) => setStageFilter(event.target.value as LearningStage | "all")}
            className="rounded-[22px] border border-white/10 bg-black/10 px-4 py-3 outline-none"
          >
            <option value="all">Все этапы</option>
            <option value="hanzi_to_translation">Stage 1</option>
            <option value="translation_to_hanzi">Stage 2</option>
          </select>

          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortValue)}
            className="rounded-[22px] border border-white/10 bg-black/10 px-4 py-3 outline-none"
          >
            <option value="due">Сначала к повторению</option>
            <option value="forgetting">По забыванию</option>
            <option value="memory">По памяти</option>
            <option value="time">По времени</option>
            <option value="alphabetical">По иероглифу</option>
          </select>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {visibleCards.map((card) => (
          <article key={card.id} className="glass-panel p-5 sm:p-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="display-hanzi text-4xl font-semibold">{card.hanzi}</p>
                  <p className="mt-2 text-lg font-medium">{card.pinyin}</p>
                  <p className="mt-1 muted-text">{card.translation}</p>
                </div>
                <div className="flex flex-col items-end gap-2 text-sm">
                  <span className="pill">{STATUS_LABELS[card.status]}</span>
                  <span className="pill">{card.computedStatus === "review" ? "К повторению" : "Стабильно"}</span>
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm">
                <p className="font-medium">{STAGE_LABELS[card.currentStage]}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center justify-between">
                    <span className="muted-text">Сила памяти</span>
                    <strong>{Math.round(card.effectiveMemoryStrength)}%</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="muted-text">Забывание</span>
                    <strong>{Math.round(card.effectiveForgettingScore)}%</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="muted-text">Ошибок</span>
                    <strong>{card.mistakes}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="muted-text">Показов</span>
                    <strong>{card.repetitions}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="muted-text">Следующий повтор</span>
                    <strong>{formatDateTime(card.nextReviewAt)}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="muted-text">Время на карточку</span>
                    <strong>{formatDuration(card.totalTimeSpent)}</strong>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="muted-text">Этап</span>
                    <span>{card.stageProgress[card.currentStage]}%</span>
                  </div>
                  <div className="progress-track h-3">
                    <div className="meter-bar h-full" style={{ width: `${card.stageProgress[card.currentStage]}%` }} />
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="muted-text">Память</span>
                    <span>{Math.round(card.effectiveMemoryStrength)}%</span>
                  </div>
                  <div className="progress-track h-3">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                      style={{ width: `${Math.round(card.effectiveMemoryStrength)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="muted-text">Забывание</span>
                    <span>{Math.round(card.effectiveForgettingScore)}%</span>
                  </div>
                  <div className="progress-track h-3">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-400 to-rose-400"
                      style={{ width: `${Math.round(card.effectiveForgettingScore)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </article>
        ))}

        {visibleCards.length === 0 ? (
          <div className="glass-panel p-8 text-sm muted-text">По текущим фильтрам карточки не найдены.</div>
        ) : null}
      </section>
    </div>
  );
}
