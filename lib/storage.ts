import { STARTER_CARD_LINES, STORAGE_KEY } from "@/lib/constants";
import { parseCardLines } from "@/lib/parser";
import type { Card, StudyStats, ThemeMode } from "@/lib/types";

export type PersistedAppState = {
  cards: Card[];
  stats: StudyStats;
  theme: ThemeMode;
};

function createDefaultStats(): StudyStats {
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

function sanitizeCard(raw: Partial<Card>): Card {
  return {
    id: raw.id ?? `card-${Date.now().toString(36)}`,
    hanzi: raw.hanzi ?? "",
    pinyin: raw.pinyin ?? "",
    translation: raw.translation ?? "",
    status: raw.status ?? "new",
    currentStage: raw.currentStage ?? "hanzi_to_translation",
    stageProgress: {
      hanzi_to_translation: raw.stageProgress?.hanzi_to_translation ?? 0,
      translation_to_hanzi: raw.stageProgress?.translation_to_hanzi ?? 0,
      hanzi_to_pinyin: raw.stageProgress?.hanzi_to_pinyin ?? 0,
      hanzi_to_pronunciation: raw.stageProgress?.hanzi_to_pronunciation ?? 0,
    },
    repetitions: raw.repetitions ?? 0,
    mistakes: raw.mistakes ?? 0,
    streakCorrect: raw.streakCorrect ?? 0,
    easeFactor: raw.easeFactor ?? 2.3,
    interval: raw.interval ?? 0,
    memoryStrength: raw.memoryStrength ?? 28,
    forgettingScore: raw.forgettingScore ?? 12,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    lastSeenAt: raw.lastSeenAt ?? null,
    lastCorrectAt: raw.lastCorrectAt ?? null,
    nextReviewAt: raw.nextReviewAt ?? null,
    totalTimeSpent: raw.totalTimeSpent ?? 0,
    averageResponseTime: raw.averageResponseTime ?? 0,
  };
}

function sanitizeStats(raw: Partial<StudyStats> | undefined): StudyStats {
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
    const fallback = createSeedState();
    const cards =
      Array.isArray(parsed.cards) && parsed.cards.length > 0
        ? parsed.cards.map(sanitizeCard)
        : fallback.cards;

    return {
      cards,
      stats: sanitizeStats(parsed.stats),
      theme: parsed.theme === "light" ? "light" : "dark",
    };
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
