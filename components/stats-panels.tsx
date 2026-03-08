"use client";

import { useStudy } from "@/context/study-context";
import { getEffectiveCardState } from "@/lib/learning";
import { dayKey, formatDuration, formatMinutes } from "@/lib/utils";

export function StatsPanels() {
  const { cards, hydrated, metrics, stats } = useStudy();

  if (!hydrated) {
    return <div className="glass-panel p-8 text-sm muted-text">Загружаю статистику…</div>;
  }

  const derivedCards = cards.map((card) => getEffectiveCardState(card));
  const activeDays = Math.max(1, Object.keys(stats.dailyStudyLog).length || (stats.totalStudyTime > 0 ? 1 : 0));
  const todayKey = dayKey(new Date());
  const weekEntries = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = dayKey(date);
    return {
      key,
      label: new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(date),
      value: stats.dailyStudyLog[key] ?? 0,
    };
  });

  const weekTotal = weekEntries.reduce((sum, entry) => sum + entry.value, 0);
  const averagePerDay = stats.totalStudyTime / activeDays;
  const studiedCards = cards.filter((card) => card.totalTimeSpent > 0);
  const averagePerCard =
    studiedCards.length > 0
      ? studiedCards.reduce((sum, card) => sum + card.totalTimeSpent, 0) / studiedCards.length
      : 0;
  const accuracy = stats.totalReviews > 0 ? Math.round((stats.totalCorrect / stats.totalReviews) * 100) : 0;
  const hardestCards = [...derivedCards]
    .sort(
      (left, right) =>
        right.mistakes + right.effectiveForgettingScore / 10 - (left.mistakes + left.effectiveForgettingScore / 10),
    )
    .slice(0, 5);

  const maxBar = Math.max(1, ...weekEntries.map((entry) => entry.value));

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="glass-panel p-5">
          <p className="subtle-text text-xs uppercase tracking-[0.18em]">Общее время</p>
          <p className="mt-4 metric-value">{formatDuration(stats.totalStudyTime)}</p>
        </div>
        <div className="glass-panel p-5">
          <p className="subtle-text text-xs uppercase tracking-[0.18em]">Среднее в день</p>
          <p className="mt-4 metric-value">{formatDuration(averagePerDay)}</p>
        </div>
        <div className="glass-panel p-5">
          <p className="subtle-text text-xs uppercase tracking-[0.18em]">Среднее на карточку</p>
          <p className="mt-4 metric-value">{formatDuration(averagePerCard)}</p>
        </div>
        <div className="glass-panel p-5">
          <p className="subtle-text text-xs uppercase tracking-[0.18em]">Серия дней</p>
          <p className="mt-4 metric-value">{stats.streakDays}</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="glass-panel p-6 sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="pill">Последние 7 дней</span>
              <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">Недельная активность</h2>
            </div>
            <div className="text-right">
              <p className="text-sm muted-text">Сегодня</p>
              <p className="text-xl font-semibold">{formatMinutes(stats.dailyStudyLog[todayKey] ?? 0)} мин</p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-7 gap-3">
            {weekEntries.map((entry) => (
              <div key={entry.key} className="flex flex-col items-center gap-3">
                <div className="flex h-44 w-full items-end rounded-[24px] border border-white/10 bg-white/5 p-2">
                  <div
                    className="w-full rounded-[18px] bg-gradient-to-t from-[rgba(var(--accent),0.92)] to-[rgba(72,182,255,0.82)]"
                    style={{ height: `${Math.max(10, (entry.value / maxBar) * 100)}%` }}
                  />
                </div>
                <div className="text-center text-sm">
                  <p className="font-medium">{entry.label}</p>
                  <p className="muted-text">{formatMinutes(entry.value)} мин</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="glass-panel p-5">
            <p className="text-sm font-semibold">Обзор</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="muted-text">Минут сегодня</span>
                <strong>{formatMinutes(stats.dailyStudyLog[todayKey] ?? 0)}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="muted-text">Минут за неделю</span>
                <strong>{formatMinutes(weekTotal)}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="muted-text">Точность</span>
                <strong>{accuracy}%</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="muted-text">Освоено</span>
                <strong>{metrics.masteredCount}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="muted-text">К повторению</span>
                <strong>{metrics.reviewCount}</strong>
              </div>
            </div>
          </div>

          <div className="glass-panel p-5">
            <p className="text-sm font-semibold">Самые трудные карточки</p>
            <div className="mt-4 space-y-3">
              {hardestCards.map((card) => (
                <div key={card.id} className="rounded-[22px] border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="display-hanzi text-2xl font-semibold">{card.hanzi}</p>
                      <p className="text-sm muted-text">{card.translation}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p>{card.mistakes} ошибок</p>
                      <p className="muted-text">{Math.round(card.effectiveForgettingScore)}% забывание</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
