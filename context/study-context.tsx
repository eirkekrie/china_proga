"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { applyReview, buildStudyQueue, computeDashboard, getEffectiveCardState, resetCardProgress } from "@/lib/learning";
import { parseCardLines } from "@/lib/parser";
import { ALL_LESSONS_ID, UNASSIGNED_LESSON_ID } from "@/lib/constants";
import {
  createSeedState,
  loadPersistedState,
  normalizePersistedState,
  savePersistedState,
  type PersistedAppState,
} from "@/lib/storage";
import { dayKey } from "@/lib/utils";
import type {
  AuthUser,
  Card,
  DashboardMetrics,
  DerivedCard,
  LearningStage,
  LessonSummary,
  ParseResult,
  ReviewGrade,
  StudySessionInput,
  StudySessionLogEntry,
  StudyFlow,
  StudyQueueOptions,
  StudyStats,
  ThemeMode,
} from "@/lib/types";

type AuthResult = {
  ok: boolean;
  error?: string;
};

type StudyContextValue = {
  authUser: AuthUser | null;
  cards: Card[];
  filteredCards: Card[];
  availableLessons: LessonSummary[];
  selectedLessonId: string;
  stats: StudyStats;
  theme: ThemeMode;
  hydrated: boolean;
  metrics: DashboardMetrics;
  login: (username: string, password: string) => Promise<AuthResult>;
  register: (name: string, username: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  setSelectedLessonId: (lessonId: string) => void;
  setTheme: (theme: ThemeMode) => void;
  importCards: (rawText: string) => ParseResult;
  updateCard: (cardId: string, patch: CardManagementPatch) => Card | null;
  deleteCards: (cardIds: string[]) => number;
  resetCardsProgress: (cardIds: string[]) => number;
  moveCardsToLesson: (cardIds: string[], lesson: CardLessonPatch) => number;
  answerCard: (cardId: string, grade: ReviewGrade, responseTimeMs: number) => Card | null;
  resetLessonProgress: (lessonId: string) => number;
  addStudyTime: (durationMs: number) => void;
  addStudySession: (session: StudySessionInput) => StudySessionLogEntry | null;
  deleteStudySession: (sessionId: string) => boolean;
  getQueue: (flow: StudyFlow, forcedStage?: LearningStage, options?: StudyQueueOptions) => DerivedCard[];
};

export type CardLessonPatch = Pick<Card, "lessonId" | "lessonTitle">;
export type CardManagementPatch = Partial<Pick<Card, "hanzi" | "pinyin" | "translation">> & Partial<CardLessonPatch>;

const SERVER_STATE_ENABLED = process.env.NEXT_PUBLIC_DISABLE_SERVER_STATE !== "1";

const StudyContext = createContext<StudyContextValue | null>(null);

function getLessonNumber(title: string) {
  const match = title.match(/\d+/);
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
}

function sortLessons(left: LessonSummary, right: LessonSummary) {
  const leftNumber = getLessonNumber(left.title);
  const rightNumber = getLessonNumber(right.title);
  if (leftNumber !== rightNumber) {
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber - rightNumber;
    }

    if (Number.isFinite(leftNumber)) {
      return -1;
    }

    if (Number.isFinite(rightNumber)) {
      return 1;
    }
  }

  return left.title.localeCompare(right.title, "ru", { numeric: true, sensitivity: "base" });
}

function buildAvailableLessons(cards: Card[]): LessonSummary[] {
  const lessons = new Map<string, LessonSummary>();
  const now = new Date();

  cards.forEach((card) => {
    if (card.lessonId === UNASSIGNED_LESSON_ID) {
      return;
    }

    const derived = getEffectiveCardState(card, now);
    const lesson = lessons.get(card.lessonId);
    if (lesson) {
      lesson.count += 1;
      lesson.newCount += card.status === "new" ? 1 : 0;
      lesson.learningCount += card.status === "learning" ? 1 : 0;
      lesson.reviewCount += derived.computedStatus === "review" ? 1 : 0;
      lesson.masteredCount += card.status === "mastered" ? 1 : 0;
      lesson.progressPercent += derived.overallProgressPercent;
      return;
    }

    lessons.set(card.lessonId, {
      id: card.lessonId,
      title: card.lessonTitle,
      count: 1,
      newCount: card.status === "new" ? 1 : 0,
      learningCount: card.status === "learning" ? 1 : 0,
      reviewCount: derived.computedStatus === "review" ? 1 : 0,
      masteredCount: card.status === "mastered" ? 1 : 0,
      progressPercent: derived.overallProgressPercent,
    });
  });

  return [...lessons.values()]
    .map((lesson) => ({
      ...lesson,
      progressPercent: lesson.count > 0 ? Math.round(lesson.progressPercent / lesson.count) : 0,
    }))
    .sort(sortLessons);
}

const STUDY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function cleanDailyStudyLog(dailyStudyLog: Record<string, number>) {
  const cleaned: Record<string, number> = {};

  Object.entries(dailyStudyLog).forEach(([key, value]) => {
    if (STUDY_DATE_PATTERN.test(key) && Number.isFinite(value) && value > 0) {
      cleaned[key] = Math.round(value);
    }
  });

  return cleaned;
}

function getLastStudyDate(dailyStudyLog: Record<string, number>) {
  return Object.keys(dailyStudyLog)
    .filter((key) => dailyStudyLog[key] > 0)
    .sort()
    .at(-1) ?? null;
}

function getCurrentStreakDays(dailyStudyLog: Record<string, number>, now: Date) {
  let streakDays = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  while ((dailyStudyLog[dayKey(cursor)] ?? 0) > 0) {
    streakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streakDays;
}

function syncStatsCalendar(stats: StudyStats, now: Date) {
  const today = dayKey(now);
  const dailyStudyLog = cleanDailyStudyLog(stats.dailyStudyLog);

  return {
    ...stats,
    dailyStudyLog,
    todayStudyTime: dailyStudyLog[today] ?? 0,
    streakDays: getCurrentStreakDays(dailyStudyLog, now),
    lastStudyDate: getLastStudyDate(dailyStudyLog),
  };
}

function normalizeStatsForToday(stats: StudyStats, now: Date) {
  return syncStatsCalendar(stats, now);
}

function recordStudyTime(stats: StudyStats, now: Date, durationMs: number) {
  const today = dayKey(now);
  const normalized = normalizeStatsForToday(stats, now);
  const dailyStudyLog = {
    ...normalized.dailyStudyLog,
    [today]: (normalized.dailyStudyLog[today] ?? 0) + durationMs,
  };

  return syncStatsCalendar(
    {
      ...normalized,
      totalStudyTime: normalized.totalStudyTime + durationMs,
      sessionStudyTime: normalized.sessionStudyTime + durationMs,
      dailyStudyLog,
    },
    now,
  );
}

function createStudySession(input: StudySessionInput, now: Date): StudySessionLogEntry | null {
  const durationMs = Math.round(input.durationMs);

  if (!STUDY_DATE_PATTERN.test(input.date) || !Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }

  return {
    id: `session-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    date: input.date,
    title: input.title.trim() || "Учебная сессия",
    activity: input.activity,
    durationMs,
    note: input.note?.trim() ?? "",
    createdAt: now.toISOString(),
  };
}

function recordStudySession(stats: StudyStats, session: StudySessionLogEntry, now: Date) {
  const normalized = normalizeStatsForToday(stats, now);
  const dailyStudyLog = {
    ...normalized.dailyStudyLog,
    [session.date]: (normalized.dailyStudyLog[session.date] ?? 0) + session.durationMs,
  };

  return syncStatsCalendar(
    {
      ...normalized,
      totalStudyTime: normalized.totalStudyTime + session.durationMs,
      dailyStudyLog,
      studySessions: [session, ...normalized.studySessions],
    },
    now,
  );
}

function removeStudySession(stats: StudyStats, session: StudySessionLogEntry, now: Date) {
  const normalized = normalizeStatsForToday(stats, now);
  const nextDayTotal = Math.max(0, (normalized.dailyStudyLog[session.date] ?? 0) - session.durationMs);
  const dailyStudyLog = {
    ...normalized.dailyStudyLog,
    [session.date]: nextDayTotal,
  };

  if (nextDayTotal <= 0) {
    delete dailyStudyLog[session.date];
  }

  return syncStatsCalendar(
    {
      ...normalized,
      totalStudyTime: Math.max(0, normalized.totalStudyTime - session.durationMs),
      dailyStudyLog,
      studySessions: normalized.studySessions.filter((entry) => entry.id !== session.id),
    },
    now,
  );
}

export function StudyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedAppState>(loadPersistedState());
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState(ALL_LESSONS_ID);
  const [hydrated, setHydrated] = useState(false);
  const persistedJsonRef = useRef<string>("");

  useEffect(() => {
    let active = true;
    const cached = loadPersistedState();

    async function hydrate() {
      if (!SERVER_STATE_ENABLED) {
        setAuthUser({
          id: "local",
          username: "local",
          name: "Локальный режим",
          createdAt: new Date().toISOString(),
        });
        persistedJsonRef.current = JSON.stringify(cached);
        setState({
          ...cached,
          stats: normalizeStatsForToday(cached.stats, new Date()),
        });
        setHydrated(true);
        return;
      }

      try {
        const userResponse = await fetch("/api/auth/me", {
          method: "GET",
          cache: "no-store",
        });

        if (!userResponse.ok) {
          if (!active) {
            return;
          }

          setAuthUser(null);
          persistedJsonRef.current = JSON.stringify(cached);
          setState({
            ...cached,
            stats: normalizeStatsForToday(cached.stats, new Date()),
          });
          return;
        }

        const { user } = (await userResponse.json()) as { user: AuthUser };
        const stateResponse = await fetch("/api/state", {
          method: "GET",
          cache: "no-store",
        });

        if (!stateResponse.ok) {
          throw new Error(`Failed to load state: ${stateResponse.status}`);
        }

        const loaded = normalizePersistedState((await stateResponse.json()) as Partial<PersistedAppState>);
        if (!active) {
          return;
        }

        setAuthUser(user);
        persistedJsonRef.current = JSON.stringify(loaded);
        setState({
          ...loaded,
          stats: normalizeStatsForToday(loaded.stats, new Date()),
        });
      } catch {
        if (!active) {
          return;
        }

        setAuthUser(null);
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
    if (!hydrated || !authUser) {
      return;
    }

    savePersistedState(state);
    const serialized = JSON.stringify(state);
    if (serialized === persistedJsonRef.current) {
      return;
    }

    persistedJsonRef.current = serialized;

    if (!SERVER_STATE_ENABLED) {
      return;
    }

    void fetch("/api/state", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: serialized,
    }).catch(() => {
      persistedJsonRef.current = "";
    });
  }, [authUser, hydrated, state]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", state.theme === "dark");
  }, [state.theme]);

  const availableLessons = useMemo(() => buildAvailableLessons(state.cards), [state.cards]);
  const filteredCards = useMemo(
    () =>
      selectedLessonId === ALL_LESSONS_ID
        ? state.cards
        : state.cards.filter((card) => card.lessonId === selectedLessonId),
    [selectedLessonId, state.cards],
  );
  const metrics = computeDashboard(filteredCards, state.stats, new Date());

  useEffect(() => {
    if (
      selectedLessonId !== ALL_LESSONS_ID &&
      selectedLessonId !== UNASSIGNED_LESSON_ID &&
      !availableLessons.some((lesson) => lesson.id === selectedLessonId)
    ) {
      setSelectedLessonId(ALL_LESSONS_ID);
    }
  }, [availableLessons, selectedLessonId]);

  function setTheme(theme: ThemeMode) {
    setState((previous) => ({
      ...previous,
      theme,
    }));
  }

  async function loadStateForAuthenticatedUser(user: AuthUser) {
    const response = await fetch("/api/state", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    });

    if (!response.ok) {
      throw new Error(response.status === 401 ? "SESSION_NOT_SAVED" : `STATE_LOAD_FAILED_${response.status}`);
    }

    const loaded = normalizePersistedState((await response.json()) as Partial<PersistedAppState>);
    persistedJsonRef.current = JSON.stringify(loaded);
    setAuthUser(user);
    setSelectedLessonId(ALL_LESSONS_ID);
    setState({
      ...loaded,
      stats: normalizeStatsForToday(loaded.stats, new Date()),
    });
  }

  async function submitAuth(path: "/api/auth/login" | "/api/auth/register", payload: Record<string, string>) {
    try {
      const response = await fetch(path, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { user?: AuthUser; error?: string };

      if (!response.ok || !body.user) {
        return { ok: false, error: body.error ?? "Не удалось войти в аккаунт." };
      }

      await loadStateForAuthenticatedUser(body.user);
      return { ok: true };
    } catch (error) {
      if (error instanceof Error && error.message === "SESSION_NOT_SAVED") {
        return {
          ok: false,
          error: "Вход прошел, но браузер не сохранил сессию. Проверьте HTTPS или перезапустите сервер с новой сборкой.",
        };
      }

      return { ok: false, error: "Сервер авторизации недоступен." };
    }
  }

  function login(username: string, password: string) {
    return submitAuth("/api/auth/login", { username, password });
  }

  function register(name: string, username: string, password: string) {
    return submitAuth("/api/auth/register", { name, username, password });
  }

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => undefined);
    setAuthUser(null);
    setSelectedLessonId(ALL_LESSONS_ID);
    setState(createSeedState());
    persistedJsonRef.current = "";
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

  function updateCard(cardId: string, patch: CardManagementPatch) {
    let updatedCard: Card | null = null;

    setState((previous) => {
      const cards = previous.cards.map((card) => {
        if (card.id !== cardId) {
          return card;
        }

        updatedCard = {
          ...card,
          ...patch,
          hanzi: patch.hanzi?.trim() ?? card.hanzi,
          pinyin: patch.pinyin?.trim() ?? card.pinyin,
          translation: patch.translation?.trim() ?? card.translation,
          lessonId: patch.lessonId?.trim() || card.lessonId,
          lessonTitle: patch.lessonTitle?.trim() || card.lessonTitle,
        };
        return updatedCard;
      });

      return {
        ...previous,
        cards,
      };
    });

    return updatedCard;
  }

  function deleteCards(cardIds: string[]) {
    const targetIds = new Set(cardIds);
    if (targetIds.size === 0) {
      return 0;
    }

    const deletedCount = state.cards.filter((card) => targetIds.has(card.id)).length;
    setState((previous) => ({
      ...previous,
      cards: previous.cards.filter((card) => !targetIds.has(card.id)),
    }));

    return deletedCount;
  }

  function resetCardsProgress(cardIds: string[]) {
    const now = new Date();
    const targetIds = new Set(cardIds);
    if (targetIds.size === 0) {
      return 0;
    }

    let resetCount = 0;
    setState((previous) => {
      const cards = previous.cards.map((card) => {
        if (!targetIds.has(card.id)) {
          return card;
        }

        resetCount += 1;
        return resetCardProgress(card, now);
      });

      return {
        ...previous,
        cards,
      };
    });

    return resetCount;
  }

  function moveCardsToLesson(cardIds: string[], lesson: CardLessonPatch) {
    const targetIds = new Set(cardIds);
    if (targetIds.size === 0) {
      return 0;
    }

    let movedCount = 0;
    setState((previous) => {
      const cards = previous.cards.map((card) => {
        if (!targetIds.has(card.id)) {
          return card;
        }

        movedCount += 1;
        return {
          ...card,
          lessonId: lesson.lessonId,
          lessonTitle: lesson.lessonTitle,
        };
      });

      return {
        ...previous,
        cards,
      };
    });

    return movedCount;
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

      const normalizedStats = normalizeStatsForToday(previous.stats, now);

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

  function resetLessonProgress(lessonId: string) {
    const now = new Date();
    const targetIds = new Set(
      state.cards
        .filter((card) =>
          lessonId === ALL_LESSONS_ID ? card.lessonId !== UNASSIGNED_LESSON_ID : card.lessonId === lessonId,
        )
        .map((card) => card.id),
    );

    setState((previous) => {
      const cards = previous.cards.map((card) => {
        if (!targetIds.has(card.id)) {
          return card;
        }

        return resetCardProgress(card, now);
      });

      return {
        ...previous,
        cards,
      };
    });

    return targetIds.size;
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

  function addStudySession(input: StudySessionInput) {
    const now = new Date();
    const session = createStudySession(input, now);

    if (!session) {
      return null;
    }

    setState((previous) => ({
      ...previous,
      stats: recordStudySession(previous.stats, session, now),
    }));

    return session;
  }

  function deleteStudySession(sessionId: string) {
    let deleted = false;
    const now = new Date();

    setState((previous) => {
      const session = previous.stats.studySessions.find((entry) => entry.id === sessionId);

      if (!session) {
        return previous;
      }

      deleted = true;

      return {
        ...previous,
        stats: removeStudySession(previous.stats, session, now),
      };
    });

    return deleted;
  }

  function getQueue(flow: StudyFlow, forcedStage?: LearningStage, options?: StudyQueueOptions) {
    return buildStudyQueue(filteredCards, flow, new Date(), forcedStage, options);
  }

  return (
    <StudyContext.Provider
      value={{
        authUser,
        cards: state.cards,
        filteredCards,
        availableLessons,
        selectedLessonId,
        stats: state.stats,
        theme: state.theme,
        hydrated,
        metrics,
        login,
        register,
        logout,
        setSelectedLessonId,
        setTheme,
        importCards,
        updateCard,
        deleteCards,
        resetCardsProgress,
        moveCardsToLesson,
        answerCard,
        resetLessonProgress,
        addStudyTime,
        addStudySession,
        deleteStudySession,
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
