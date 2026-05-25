"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useStudy } from "@/context/study-context";
import { getEffectiveCardState } from "@/lib/learning";
import { dayKey, formatDuration, formatMinutes } from "@/lib/utils";
import type { StudyActivityKind, StudySessionLogEntry } from "@/lib/types";

const DAY_MS = 1000 * 60 * 60 * 24;

const activityOptions: Array<{ id: StudyActivityKind; label: string }> = [
  { id: "cards", label: "Карточки" },
  { id: "test", label: "Тест" },
  { id: "tones", label: "Тоны" },
  { id: "grammar", label: "Грамматика" },
  { id: "reading", label: "Чтение" },
  { id: "listening", label: "Аудирование" },
  { id: "writing", label: "Письмо" },
  { id: "speaking", label: "Разговор" },
  { id: "custom", label: "Другое" },
];

const activityLabels = Object.fromEntries(activityOptions.map((option) => [option.id, option.label])) as Record<
  StudyActivityKind,
  string
>;

const heatColors = [
  "rgba(var(--panel-strong),0.92)",
  "#172554",
  "#1e3a8a",
  "#1d4ed8",
  "#2563eb",
  "#3b82f6",
  "#93c5fd",
  "#dbeafe",
];

const legendThresholds = [
  { label: "15 мин", minutes: 15 },
  { label: "30 мин", minutes: 30 },
  { label: "1 час", minutes: 60 },
  { label: "2 часа", minutes: 120 },
  { label: "3+ часа", minutes: 180 },
  { label: "6+ часов", minutes: 360 },
];

type CalendarDay = {
  key: string;
  date: Date;
};

type SessionFormState = {
  date: string;
  activity: StudyActivityKind;
  title: string;
  durationMinutes: string;
  note: string;
};

function dateFromKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`);
}

function capitalize(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function formatFullDate(dateKey: string) {
  return capitalize(
    new Intl.DateTimeFormat("ru-RU", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(dateFromKey(dateKey)),
  );
}

function getHeatLevel(durationMs: number) {
  const minutes = durationMs / 60000;

  if (minutes <= 0) {
    return 0;
  }

  if (minutes < 15) {
    return 1;
  }

  if (minutes < 30) {
    return 2;
  }

  if (minutes < 60) {
    return 3;
  }

  if (minutes < 120) {
    return 4;
  }

  if (minutes < 180) {
    return 5;
  }

  if (minutes < 360) {
    return 6;
  }

  return 7;
}

function buildCalendar(year: number) {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const calendarStart = new Date(yearStart);
  const calendarEnd = new Date(yearEnd);
  calendarStart.setDate(calendarStart.getDate() - calendarStart.getDay());
  calendarEnd.setDate(calendarEnd.getDate() + (6 - calendarEnd.getDay()));

  const days: CalendarDay[] = [];
  for (let cursor = new Date(calendarStart); cursor <= calendarEnd; cursor.setDate(cursor.getDate() + 1)) {
    const date = new Date(cursor);
    days.push({ key: dayKey(date), date });
  }

  const weeks: CalendarDay[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }

  const monthFormatter = new Intl.DateTimeFormat("ru-RU", { month: "short" });
  const monthLabels = Array.from({ length: 12 }, (_, month) => {
    const monthStart = new Date(year, month, 1);
    const column = Math.floor((monthStart.getTime() - calendarStart.getTime()) / (DAY_MS * 7)) + 1;

    return {
      key: month,
      column,
      label: monthFormatter.format(monthStart).replace(".", ""),
    };
  });

  return { weeks, monthLabels };
}

function getSessionActivityTotal(sessions: StudySessionLogEntry[]) {
  return sessions.reduce((sum, session) => sum + session.durationMs, 0);
}

function buildDefaultForm(date: string): SessionFormState {
  return {
    date,
    activity: "cards",
    title: "",
    durationMinutes: "30",
    note: "",
  };
}

export function StatsPanels() {
  const { addStudySession, deleteStudySession, filteredCards, hydrated, metrics, stats } = useStudy();
  const todayKey = dayKey(new Date());
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SessionFormState>(() => buildDefaultForm(todayKey));
  const [formError, setFormError] = useState<string | null>(null);

  const calendar = useMemo(() => buildCalendar(selectedYear), [selectedYear]);

  useEffect(() => {
    setForm((previous) => ({ ...previous, date: selectedDate }));
    setFormError(null);
  }, [selectedDate]);

  if (!hydrated) {
    return <div className="glass-panel p-8 text-sm muted-text">Загружаю статистику...</div>;
  }

  const yearPrefix = `${selectedYear}-`;
  const yearlyDailyEntries = Object.entries(stats.dailyStudyLog).filter(
    ([key, value]) => key.startsWith(yearPrefix) && value > 0,
  );
  const yearTotal = yearlyDailyEntries.reduce((sum, [, value]) => sum + value, 0);
  const activeDays = yearlyDailyEntries.length;
  const averagePerStudiedDay = activeDays > 0 ? yearTotal / activeDays : 0;
  const selectedDayTotal = stats.dailyStudyLog[selectedDate] ?? 0;
  const selectedDaySessions = stats.studySessions
    .filter((session) => session.date === selectedDate)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const selectedDayManualTotal = getSessionActivityTotal(selectedDaySessions);
  const selectedDayAutomaticTotal = Math.max(0, selectedDayTotal - selectedDayManualTotal);
  const yearlySessions = stats.studySessions.filter((session) => session.date.startsWith(yearPrefix));
  const manualYearTotal = getSessionActivityTotal(yearlySessions);
  const activityTotals = new Map<StudyActivityKind, number>();

  yearlySessions.forEach((session) => {
    activityTotals.set(session.activity, (activityTotals.get(session.activity) ?? 0) + session.durationMs);
  });

  const automaticCardsTotal = Math.max(0, yearTotal - manualYearTotal);
  if (automaticCardsTotal > 0) {
    activityTotals.set("cards", (activityTotals.get("cards") ?? 0) + automaticCardsTotal);
  }

  const topActivity = [...activityTotals.entries()].sort((left, right) => right[1] - left[1])[0] ?? null;
  const derivedCards = filteredCards.map((card) => getEffectiveCardState(card));
  const accuracy = stats.totalReviews > 0 ? Math.round((stats.totalCorrect / stats.totalReviews) * 100) : 0;
  const hardestCards = [...derivedCards]
    .sort(
      (left, right) =>
        right.mistakes + right.effectiveForgettingScore / 10 - (left.mistakes + left.effectiveForgettingScore / 10),
    )
    .slice(0, 4);

  function changeYear(nextYear: number) {
    setSelectedYear(nextYear);
    setSelectedDate((previous) =>
      previous.startsWith(`${nextYear}-`) ? previous : nextYear === currentYear ? todayKey : `${nextYear}-01-01`,
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const durationMinutes = Number(form.durationMinutes.replace(",", "."));
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      setFormError("Укажите длительность больше нуля.");
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      setFormError("Выберите дату сессии.");
      return;
    }

    const session = addStudySession({
      date: form.date,
      activity: form.activity,
      title: form.title.trim() || activityLabels[form.activity],
      durationMs: Math.round(durationMinutes * 60000),
      note: form.note,
    });

    if (!session) {
      setFormError("Не удалось сохранить сессию.");
      return;
    }

    setSelectedDate(session.date);
    setSelectedYear(Number(session.date.slice(0, 4)));
    setForm(buildDefaultForm(session.date));
    setFormError(null);
    setShowForm(false);
  }

  return (
    <div className="grid gap-6">
      <section className="glass-panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <span className="pill">Календарь активности</span>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">Время учёбы по дням</h2>
          </div>
          <div className="flex items-center gap-3 self-start lg:self-center">
            <button
              type="button"
              className="theme-toggle"
              aria-label="Предыдущий год"
              onClick={() => changeYear(selectedYear - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <p className="min-w-20 text-center text-2xl font-semibold">{selectedYear}</p>
            <button
              type="button"
              className="theme-toggle"
              aria-label="Следующий год"
              onClick={() => changeYear(selectedYear + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="mt-7 thin-scrollbar overflow-x-auto pb-2">
          <div className="min-w-[47rem]">
            <div
              className="mb-2 ml-8 grid gap-[3px] text-[10px] muted-text"
              style={{ gridTemplateColumns: `repeat(${calendar.weeks.length}, minmax(0, 0.75rem))` }}
            >
              {calendar.monthLabels.map((month) => (
                <span key={month.key} style={{ gridColumnStart: month.column }}>
                  {month.label}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-[1.5rem_auto] gap-2">
              <div className="grid grid-rows-7 gap-[3px] text-[10px] leading-3 muted-text">
                {["", "Пн", "", "Ср", "", "Пт", ""].map((label, index) => (
                  <span key={`${label}-${index}`} className="h-3">
                    {label}
                  </span>
                ))}
              </div>

              <div
                className="grid gap-[3px]"
                style={{ gridTemplateColumns: `repeat(${calendar.weeks.length}, minmax(0, 0.75rem))` }}
              >
                {calendar.weeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="grid grid-rows-7 gap-[3px]">
                    {week.map((day) => {
                      const inSelectedYear = day.date.getFullYear() === selectedYear;
                      const dayTotal = inSelectedYear ? (stats.dailyStudyLog[day.key] ?? 0) : 0;
                      const heatLevel = getHeatLevel(dayTotal);
                      const selected = selectedDate === day.key;

                      return (
                        <button
                          key={day.key}
                          type="button"
                          disabled={!inSelectedYear}
                          title={`${formatFullDate(day.key)}: ${formatDuration(dayTotal)}`}
                          className={[
                            "h-3 w-3 rounded-[3px] border transition",
                            selected
                              ? "border-white/90 ring-2 ring-[rgba(var(--accent),0.55)]"
                              : "border-transparent hover:border-[rgba(var(--foreground),0.55)]",
                            inSelectedYear ? "" : "pointer-events-none opacity-0",
                          ].join(" ")}
                          style={{ backgroundColor: heatColors[heatLevel] }}
                          onClick={() => setSelectedDate(day.key)}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-center">
          <div className="flex items-center gap-2 text-sm muted-text">
            <span>Меньше</span>
            {heatColors.map((color, index) => (
              <span
                key={color}
                className="h-4 w-4 rounded-[4px] border border-[rgba(var(--border),0.18)]"
                style={{ backgroundColor: color }}
                title={index === 0 ? "Нет времени" : legendThresholds[Math.max(0, index - 1)]?.label}
              />
            ))}
            <span>Больше</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs muted-text">
            {legendThresholds.map((threshold) => (
              <span key={threshold.minutes}>{threshold.label}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="glass-panel p-5">
          <p className="subtle-text text-xs uppercase tracking-[0.18em]">Всего за {selectedYear}</p>
          <p className="mt-4 metric-value">{formatDuration(yearTotal)}</p>
        </div>
        <div className="glass-panel p-5">
          <p className="subtle-text text-xs uppercase tracking-[0.18em]">Дней с учёбой</p>
          <p className="mt-4 metric-value">{activeDays}</p>
        </div>
        <div className="glass-panel p-5">
          <p className="subtle-text text-xs uppercase tracking-[0.18em]">Дней подряд</p>
          <p className="mt-4 metric-value">{stats.streakDays}</p>
        </div>
        <div className="glass-panel p-5">
          <p className="subtle-text text-xs uppercase tracking-[0.18em]">Топ активность</p>
          <p className="mt-4 metric-value text-3xl">{topActivity ? activityLabels[topActivity[0]] : "—"}</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="glass-panel p-6 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.04em]">
                {selectedDate === todayKey ? "Сегодня" : "Выбранный день"}
              </h2>
              <p className="mt-2 muted-text">{formatFullDate(selectedDate)}</p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm muted-text">Всего за день</p>
              <p className="text-2xl font-semibold">{formatDuration(selectedDayTotal)}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            <button
              type="button"
              className="flex min-h-14 items-center justify-center gap-2 rounded-[14px] border border-dashed border-[rgba(var(--border),0.48)] bg-[rgba(var(--panel-strong),0.25)] px-4 py-3 text-sm font-semibold text-[rgb(var(--accent-strong))] transition hover:border-[rgba(var(--accent),0.5)] hover:bg-[rgba(var(--accent),0.08)]"
              onClick={() => setShowForm((value) => !value)}
            >
              <Plus size={16} />
              Добавить учебную сессию
            </button>

            {showForm ? (
              <form className="grid gap-4 rounded-[14px] border border-[rgba(var(--border),0.18)] bg-white/5 p-4" onSubmit={handleSubmit}>
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_8rem]">
                  <label className="grid gap-2 text-sm">
                    <span className="font-medium">Дата</span>
                    <input
                      type="date"
                      value={form.date}
                      className="rounded-[14px] px-3 py-3"
                      onChange={(event) => setForm((previous) => ({ ...previous, date: event.target.value }))}
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span className="font-medium">Тип</span>
                    <select
                      value={form.activity}
                      className="rounded-[14px] px-3 py-3"
                      onChange={(event) =>
                        setForm((previous) => ({ ...previous, activity: event.target.value as StudyActivityKind }))
                      }
                    >
                      {activityOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span className="font-medium">Минуты</span>
                    <input
                      type="number"
                      min="1"
                      step="5"
                      value={form.durationMinutes}
                      className="rounded-[14px] px-3 py-3"
                      onChange={(event) =>
                        setForm((previous) => ({ ...previous, durationMinutes: event.target.value }))
                      }
                    />
                  </label>
                </div>

                <label className="grid gap-2 text-sm">
                  <span className="font-medium">Название</span>
                  <input
                    value={form.title}
                    placeholder="Например: чтение текста, разбор грамматики, разговорная практика"
                    className="rounded-[14px] px-3 py-3"
                    onChange={(event) => setForm((previous) => ({ ...previous, title: event.target.value }))}
                  />
                </label>

                <label className="grid gap-2 text-sm">
                  <span className="font-medium">Заметка</span>
                  <textarea
                    value={form.note}
                    rows={3}
                    placeholder="Необязательно"
                    className="resize-none rounded-[14px] px-3 py-3"
                    onChange={(event) => setForm((previous) => ({ ...previous, note: event.target.value }))}
                  />
                </label>

                {formError ? <p className="text-sm text-[rgb(var(--danger))]">{formError}</p> : null}

                <div className="flex flex-wrap gap-3">
                  <button type="submit" className="btn-primary">
                    Сохранить сессию
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>
                    Отмена
                  </button>
                </div>
              </form>
            ) : null}
          </div>

          <div className="mt-6 grid gap-3">
            {selectedDayAutomaticTotal > 0 ? (
              <div className="rounded-[14px] border border-[rgba(var(--border),0.18)] bg-[rgba(var(--panel),0.34)] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">Карточки и тренировки</p>
                    <p className="mt-1 text-sm muted-text">Записано автоматически во время занятий в приложении.</p>
                  </div>
                  <strong className="whitespace-nowrap">{formatDuration(selectedDayAutomaticTotal)}</strong>
                </div>
              </div>
            ) : null}

            {selectedDaySessions.map((session) => (
              <div key={session.id} className="rounded-[14px] border border-[rgba(var(--border),0.18)] bg-[rgba(var(--panel),0.34)] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{session.title}</p>
                      <span className="pill px-2 py-1">{activityLabels[session.activity]}</span>
                    </div>
                    {session.note ? <p className="mt-2 text-sm muted-text">{session.note}</p> : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <strong className="whitespace-nowrap">{formatDuration(session.durationMs)}</strong>
                    <button
                      type="button"
                      className="theme-toggle h-9 min-h-9 w-9"
                      aria-label="Удалить сессию"
                      onClick={() => deleteStudySession(session.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {selectedDayTotal <= 0 ? (
              <p className="rounded-[14px] border border-dashed border-[rgba(var(--border),0.28)] p-5 text-center text-sm muted-text">
                На этот день пока нет записанного времени.
              </p>
            ) : null}
          </div>
        </div>

        <aside className="grid gap-4">
          <div className="glass-panel p-5">
            <p className="text-sm font-semibold">Обзор</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="muted-text">Сегодня</span>
                <strong>{formatMinutes(stats.dailyStudyLog[todayKey] ?? 0)} мин</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="muted-text">Среднее за активный день</span>
                <strong>{formatDuration(averagePerStudiedDay)}</strong>
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
            <p className="text-sm font-semibold">Сложные карточки</p>
            <div className="mt-4 space-y-3">
              {hardestCards.map((card) => (
                <div key={card.id} className="rounded-[14px] border border-[rgba(var(--border),0.18)] bg-white/5 p-3">
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
        </aside>
      </section>
    </div>
  );
}
