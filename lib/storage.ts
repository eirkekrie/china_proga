import {
  createInitialFsrsSnapshot,
  deriveFsrsEaseFactor,
  deriveFsrsForgettingScore,
  deriveFsrsInterval,
  deriveFsrsMemoryStrength,
  ensureFsrsSnapshot,
} from "@/lib/fsrs";
import { STARTER_CARD_LINES, STORAGE_KEY, UNASSIGNED_LESSON_ID, UNASSIGNED_LESSON_TITLE } from "@/lib/constants";
import { parseCardLines } from "@/lib/parser";
import type {
  AccountStudyState,
  Card,
  StudyAccount,
  StudyActivityKind,
  StudySessionLogEntry,
  StudyStats,
  ThemeMode,
} from "@/lib/types";

export type PersistedAppState = {
  cards: Card[];
  stats: StudyStats;
  accounts: StudyAccount[];
  activeAccountId: string;
  accountStates: Record<string, AccountStudyState>;
  theme: ThemeMode;
};

export const DEFAULT_ACCOUNT_ID = "account-default";
export const DEFAULT_ACCOUNT_NAME = "Основной";

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
    studySessions: [],
  };
}

export function createDefaultAccount(now = new Date()): StudyAccount {
  const timestamp = now.toISOString();

  return {
    id: DEFAULT_ACCOUNT_ID,
    name: DEFAULT_ACCOUNT_NAME,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const studyActivityKinds = new Set<StudyActivityKind>([
  "cards",
  "test",
  "tones",
  "grammar",
  "reading",
  "listening",
  "writing",
  "speaking",
  "custom",
]);

function sanitizeDailyStudyLog(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(raw)
      .map(([key, value]) => [key, Number(value)] as const)
      .filter(([key, value]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(value) && value > 0)
      .map(([key, value]) => [key, Math.round(value)]),
  );
}

function sanitizeDate(value: unknown, fallback: string) {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime()) ? value : fallback;
}

function sanitizeAccount(raw: Partial<StudyAccount> | undefined, index: number, now: Date): StudyAccount | null {
  const fallbackTimestamp = now.toISOString();
  const id = typeof raw?.id === "string" && raw.id.trim() ? raw.id.trim() : `account-${index + 1}`;

  if (!id) {
    return null;
  }

  return {
    id,
    name: typeof raw?.name === "string" && raw.name.trim() ? raw.name.trim() : `Аккаунт ${index + 1}`,
    createdAt: sanitizeDate(raw?.createdAt, fallbackTimestamp),
    updatedAt: sanitizeDate(raw?.updatedAt, fallbackTimestamp),
  };
}

function sanitizeStudySession(raw: Partial<StudySessionLogEntry> | undefined, index: number): StudySessionLogEntry | null {
  const durationMs = Number(raw?.durationMs);
  const date = typeof raw?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null;

  if (!date || !Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }

  const activity = studyActivityKinds.has(raw?.activity as StudyActivityKind)
    ? (raw?.activity as StudyActivityKind)
    : "custom";
  const fallbackTitle = activity === "cards" ? "Карточки" : "Учебная сессия";
  const title = typeof raw?.title === "string" && raw.title.trim() ? raw.title.trim() : fallbackTitle;
  const createdAt =
    typeof raw?.createdAt === "string" && !Number.isNaN(new Date(raw.createdAt).getTime())
      ? raw.createdAt
      : new Date(`${date}T12:00:00`).toISOString();

  return {
    id: typeof raw?.id === "string" && raw.id.trim() ? raw.id : `session-${date}-${index}`,
    date,
    title,
    activity,
    durationMs: Math.round(durationMs),
    note: typeof raw?.note === "string" ? raw.note.trim() : "",
    createdAt,
  };
}

export function sanitizeCard(raw: Partial<Card> & { currentStage?: string }): Card {
  const now = new Date();
  const rawStage = typeof raw.currentStage === "string" ? (raw.currentStage as string) : "";
  const lessonId =
    typeof raw.lessonId === "string" && raw.lessonId.trim() ? raw.lessonId.trim() : UNASSIGNED_LESSON_ID;
  const lessonTitle =
    typeof raw.lessonTitle === "string" && raw.lessonTitle.trim()
      ? raw.lessonTitle.trim()
      : lessonId === UNASSIGNED_LESSON_ID
        ? UNASSIGNED_LESSON_TITLE
        : lessonId;
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
    lessonId,
    lessonTitle,
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
  const dailyStudyLog = sanitizeDailyStudyLog(raw?.dailyStudyLog);

  return {
    ...createDefaultStats(),
    ...raw,
    todayStudyTime: raw?.todayStudyTime ?? 0,
    sessionStudyTime: 0,
    dailyStudyLog,
    studySessions: Array.isArray(raw?.studySessions)
      ? raw.studySessions
          .map((session, index) => sanitizeStudySession(session as Partial<StudySessionLogEntry>, index))
          .filter((session): session is StudySessionLogEntry => Boolean(session))
      : [],
  };
}

function sanitizeAccountStudyState(
  raw: Partial<AccountStudyState> | undefined,
  fallback: AccountStudyState,
): AccountStudyState {
  const cards = Array.isArray(raw?.cards)
    ? raw.cards.map((card) => sanitizeCard(card as Partial<Card> & { currentStage?: string }))
    : fallback.cards;

  return {
    cards,
    stats: sanitizeStats(raw?.stats ?? fallback.stats),
  };
}

export function createSeedState(): PersistedAppState {
  const parsed = parseCardLines(STARTER_CARD_LINES);
  const account = createDefaultAccount();
  const accountState = {
    cards: parsed.cards,
    stats: createDefaultStats(),
  };

  return {
    cards: accountState.cards,
    stats: accountState.stats,
    accounts: [account],
    activeAccountId: account.id,
    accountStates: {
      [account.id]: accountState,
    },
    theme: "dark",
  };
}

export function normalizePersistedState(raw: Partial<PersistedAppState> | undefined): PersistedAppState {
  const fallback = createSeedState();
  const now = new Date();
  const legacyState = {
    cards: Array.isArray(raw?.cards)
      ? raw.cards.map((card) => sanitizeCard(card as Partial<Card> & { currentStage?: string }))
      : fallback.cards,
    stats: sanitizeStats(raw?.stats),
  };
  const rawAccounts = Array.isArray(raw?.accounts) ? raw.accounts : [];
  const seenAccountIds = new Set<string>();
  const accounts = rawAccounts
    .map((account, index) => sanitizeAccount(account as Partial<StudyAccount>, index, now))
    .filter((account): account is StudyAccount => Boolean(account))
    .filter((account) => {
      if (seenAccountIds.has(account.id)) {
        return false;
      }

      seenAccountIds.add(account.id);
      return true;
    });

  if (accounts.length === 0) {
    accounts.push(createDefaultAccount(now));
  }

  const activeAccountId =
    typeof raw?.activeAccountId === "string" && accounts.some((account) => account.id === raw.activeAccountId)
      ? raw.activeAccountId
      : accounts[0].id;
  const rawAccountStates =
    raw?.accountStates && typeof raw.accountStates === "object"
      ? (raw.accountStates as Record<string, Partial<AccountStudyState> | undefined>)
      : {};
  const accountStates: Record<string, AccountStudyState> = {};

  accounts.forEach((account) => {
    const fallbackState = account.id === activeAccountId ? legacyState : { cards: fallback.cards, stats: createDefaultStats() };
    accountStates[account.id] = sanitizeAccountStudyState(rawAccountStates[account.id], fallbackState);
  });

  if (Array.isArray(raw?.cards) || raw?.stats) {
    accountStates[activeAccountId] = legacyState;
  }

  const activeState = accountStates[activeAccountId] ?? legacyState;

  return {
    cards: activeState.cards,
    stats: activeState.stats,
    accounts,
    activeAccountId,
    accountStates,
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

  const normalized = normalizePersistedState(state);
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...normalized,
      stats: {
        ...normalized.stats,
      },
    }),
  );
}


