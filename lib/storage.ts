import {
  createInitialFsrsSnapshot,
  deriveFsrsEaseFactor,
  deriveFsrsForgettingScore,
  deriveFsrsInterval,
  deriveFsrsMemoryStrength,
  ensureFsrsSnapshot,
} from "@/lib/fsrs";
import { STARTER_CARD_LINES, STORAGE_KEY } from "@/lib/constants";
import { parseCardLines } from "@/lib/parser";
import type { Card, StudyStats, ThemeMode } from "@/lib/types";

export type PersistedAppState = {
  cards: Card[];
  stats: StudyStats;
  theme: ThemeMode;
};

export function createDefaultStats(): StudyStats {
  return {
    totalStudyTime: 0,
    todayStudyTime: 0,
    sessionStudyTime: 0,
    totalReviews: 0,
    totalCorrect: 0,
    totalWrong: 0,
    streakDays: 0,
    lastStudyDate: null,
    dailyStudyLog: {},
  };
}

export function sanitizeCard(raw: Partial<Card> & { currentStage?: string }): Card {
  const now = new Date();
  const rawStage = typeof raw.currentStage === "string" ? (raw.currentStage as string) : "";
  const stageProgress = {
    hanzi_to_translation: raw.stageProgress?.hanzi_to_translation ?? 0,
    translation_to_hanzi: raw.stageProgress?.translation_to_hanzi ?? 0,
    hanzi_to_pinyin: raw.stageProgress?.hanzi_to_pinyin ?? 0,
  };

  const isLegacyRemovedStage = rawStage === "hanzi_to_pronunciation";
  const currentStage =
    rawStage === "translation_to_hanzi" || rawStage === "hanzi_to_pinyin"
      ? rawStage
      : "hanzi_to_translation";
  const status = isLegacyRemovedStage && raw.status !== "new" ? "mastered" : raw.status ?? "new";

  if (isLegacyRemovedStage) {
    stageProgress.translation_to_hanzi = Math.max(stageProgress.translation_to_hanzi, 100);
  }

  const fsrs = ensureFsrsSnapshot(
    {
      ...raw,
      currentStage,
      status,
      stageProgress,
      nextReviewAt:
        isLegacyRemovedStage && !raw.nextReviewAt
          ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString()
          : raw.nextReviewAt ?? null,
    },
    now,
  );

  const nextReviewAt =
    raw.nextReviewAt ?? (status === "new" && (raw.repetitions ?? 0) === 0 ? null : fsrs.due);

  return {
    id: raw.id ?? `card-${Date.now().toString(36)}`,
    hanzi: raw.hanzi ?? "",
    pinyin: raw.pinyin ?? "",
    translation: raw.translation ?? "",
    status,
    currentStage,
    stageProgress,
    repetitions: raw.repetitions ?? fsrs.reps ?? 0,
    mistakes: raw.mistakes ?? fsrs.lapses ?? 0,
    streakCorrect: raw.streakCorrect ?? 0,
    easeFactor: raw.easeFactor ?? deriveFsrsEaseFactor(fsrs, now),
    interval: raw.interval ?? deriveFsrsInterval(fsrs, now),
    memoryStrength: raw.memoryStrength ?? deriveFsrsMemoryStrength(fsrs, now),
    forgettingScore: raw.forgettingScore ?? deriveFsrsForgettingScore(fsrs, now),
    createdAt: raw.createdAt ?? new Date().toISOString(),
    lastSeenAt: raw.lastSeenAt ?? null,
    lastCorrectAt: raw.lastCorrectAt ?? null,
    nextReviewAt,
    fsrs: raw.fsrs ? fsrs : status === "new" && (raw.repetitions ?? 0) === 0 ? createInitialFsrsSnapshot(now) : fsrs,
    totalTimeSpent: raw.totalTimeSpent ?? 0,
    averageResponseTime: raw.averageResponseTime ?? 0,
  };
}

export function sanitizeStats(raw: Partial<StudyStats> | undefined): StudyStats {
  return {
    ...createDefaultStats(),
    ...raw,
    todayStudyTime: raw?.todayStudyTime ?? 0,
    sessionStudyTime: 0,
    dailyStudyLog: raw?.dailyStudyLog ?? {},
  };
}

export function createSeedState(): PersistedAppState {
  const parsed = parseCardLines(STARTER_CARD_LINES);
  return {
    cards: parsed.cards,
    stats: createDefaultStats(),
    theme: "dark",
  };
}

export function normalizePersistedState(raw: Partial<PersistedAppState> | undefined): PersistedAppState {
  const fallback = createSeedState();
  const cards =
    Array.isArray(raw?.cards) && raw.cards.length > 0 ? raw.cards.map((card) => sanitizeCard(card as Partial<Card> & { currentStage?: string })) : fallback.cards;

  return {
    cards,
    stats: sanitizeStats(raw?.stats),
    theme: raw?.theme === "light" ? "light" : "dark",
  };
}

export function loadPersistedState(): PersistedAppState {
  if (typeof window === "undefined") {
    return createSeedState();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createSeedState();
    }

    const parsed = JSON.parse(raw) as Partial<PersistedAppState>;
    return normalizePersistedState(parsed);
  } catch {
    return createSeedState();
  }
}

export function savePersistedState(state: PersistedAppState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...state,
      stats: {
        ...state.stats,
      },
    }),
  );
}


