"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { applyReview, buildStudyQueue, computeDashboard } from "@/lib/learning";
import { parseCardLines } from "@/lib/parser";
import {
  loadPersistedState,
  normalizePersistedState,
  savePersistedState,
  type PersistedAppState,
} from "@/lib/storage";
import { dayKey } from "@/lib/utils";
import type {
  Card,
  DashboardMetrics,
  DerivedCard,
  LearningStage,
  ParseResult,
  ReviewGrade,
  StudyFlow,
  StudyStats,
  ThemeMode,
} from "@/lib/types";

type StudyContextValue = {
  cards: Card[];
  stats: StudyStats;
  theme: ThemeMode;
  hydrated: boolean;
  metrics: DashboardMetrics;
  setTheme: (theme: ThemeMode) => void;
  importCards: (rawText: string) => ParseResult;
  answerCard: (cardId: string, grade: ReviewGrade, responseTimeMs: number) => Card | null;
  addStudyTime: (durationMs: number) => void;
  getQueue: (flow: StudyFlow, forcedStage?: LearningStage) => DerivedCard[];
};

const StudyContext = createContext<StudyContextValue | null>(null);

function shouldPreferCachedState(cached: PersistedAppState, remote: PersistedAppState) {
  const cachedPracticedCards = cached.cards.filter((card) => card.repetitions > 0 || card.status !== "new").length;
  const remotePracticedCards = remote.cards.filter((card) => card.repetitions > 0 || card.status !== "new").length;

  if (cached.cards.length !== remote.cards.length) {
    return cached.cards.length > remote.cards.length;
  }

  if (cached.stats.totalReviews !== remote.stats.totalReviews) {
    return cached.stats.totalReviews > remote.stats.totalReviews;
  }

  if (cached.stats.totalStudyTime !== remote.stats.totalStudyTime) {
    return cached.stats.totalStudyTime > remote.stats.totalStudyTime;
  }

  return cachedPracticedCards > remotePracticedCards;
}

function touchStudyDay(stats: StudyStats, now: Date) {
  const today = dayKey(now);
  if (stats.lastStudyDate === today) {
    return stats;
  }

  if (!stats.lastStudyDate) {
    return {
      ...stats,
      streakDays: 1,
      lastStudyDate: today,
    };
  }

  const previousDate = new Date(`${stats.lastStudyDate}T00:00:00`);
  const yesterday = new Date(`${today}T00:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);

  return {
    ...stats,
    streakDays: dayKey(previousDate) === dayKey(yesterday) ? stats.streakDays + 1 : 1,
    lastStudyDate: today,
  };
}

function normalizeStatsForToday(stats: StudyStats, now: Date) {
  const today = dayKey(now);
  if (stats.lastStudyDate === today || stats.lastStudyDate === null) {
    return stats;
  }

  return {
    ...stats,
    todayStudyTime: 0,
  };
}

function recordStudyTime(stats: StudyStats, now: Date, durationMs: number) {
  const touched = touchStudyDay(normalizeStatsForToday(stats, now), now);
  const today = dayKey(now);

  return {
    ...touched,
    totalStudyTime: touched.totalStudyTime + durationMs,
    todayStudyTime: touched.todayStudyTime + durationMs,
    sessionStudyTime: touched.sessionStudyTime + durationMs,
    dailyStudyLog: {
      ...touched.dailyStudyLog,
      [today]: (touched.dailyStudyLog[today] ?? 0) + durationMs,
    },
  };
}

export function StudyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedAppState>(loadPersistedState());
  const [hydrated, setHydrated] = useState(false);
  const persistedJsonRef = useRef<string>("");

  useEffect(() => {
    let active = true;
    const cached = loadPersistedState();

    async function hydrate() {
      try {
        const response = await fetch("/api/state", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Failed to load state: ${response.status}`);
        }

        const loaded = normalizePersistedState((await response.json()) as Partial<PersistedAppState>);
        if (!active) {
          return;
        }

        const preferred = shouldPreferCachedState(cached, loaded) ? cached : loaded;
        persistedJsonRef.current = JSON.stringify(preferred);
        setState({
          ...preferred,
          stats: normalizeStatsForToday(preferred.stats, new Date()),
        });
      } catch {
        if (!active) {
          return;
        }

        persistedJsonRef.current = JSON.stringify(cached);
        setState({
          ...cached,
          stats: normalizeStatsForToday(cached.stats, new Date()),
        });
      } finally {
        if (active) {
          setHydrated(true);
        }
      }
    }

    void hydrate();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    savePersistedState(state);
    const serialized = JSON.stringify(state);
    if (serialized === persistedJsonRef.current) {
      return;
    }

    persistedJsonRef.current = serialized;

    void fetch("/api/state", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: serialized,
    }).catch(() => {
      persistedJsonRef.current = "";
    });
  }, [hydrated, state]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", state.theme === "dark");
  }, [state.theme]);

  const metrics = computeDashboard(state.cards, state.stats, new Date());

  function setTheme(theme: ThemeMode) {
    setState((previous) => ({
      ...previous,
      theme,
    }));
  }

  function importCards(rawText: string) {
    const result = parseCardLines(rawText, state.cards);
    if (result.cards.length === 0) {
      return result;
    }

    setState((previous) => ({
      ...previous,
      cards: [...previous.cards, ...result.cards],
    }));

    return result;
  }

  function answerCard(cardId: string, grade: ReviewGrade, responseTimeMs: number) {
    const now = new Date();
    let updatedCard: Card | null = null;

    setState((previous) => {
      const cards = previous.cards.map((card) => {
        if (card.id !== cardId) {
          return card;
        }

        updatedCard = applyReview(card, grade, responseTimeMs, now);
        return updatedCard;
      });

      const normalizedStats = touchStudyDay(normalizeStatsForToday(previous.stats, now), now);

      return {
        ...previous,
        cards,
        stats: {
          ...normalizedStats,
          totalReviews: normalizedStats.totalReviews + 1,
          totalCorrect: normalizedStats.totalCorrect + (grade === "again" ? 0 : 1),
          totalWrong: normalizedStats.totalWrong + (grade === "again" ? 1 : 0),
        },
      };
    });

    return updatedCard;
  }

  function addStudyTime(durationMs: number) {
    if (durationMs <= 0) {
      return;
    }

    setState((previous) => ({
      ...previous,
      stats: recordStudyTime(previous.stats, new Date(), durationMs),
    }));
  }

  function getQueue(flow: StudyFlow, forcedStage?: LearningStage) {
    return buildStudyQueue(state.cards, flow, new Date(), forcedStage);
  }

  return (
    <StudyContext.Provider
      value={{
        cards: state.cards,
        stats: state.stats,
        theme: state.theme,
        hydrated,
        metrics,
        setTheme,
        importCards,
        answerCard,
        addStudyTime,
        getQueue,
      }}
    >
      {children}
    </StudyContext.Provider>
  );
}

export function useStudy() {
  const context = useContext(StudyContext);
  if (!context) {
    throw new Error("useStudy must be used inside StudyProvider");
  }

  return context;
}
