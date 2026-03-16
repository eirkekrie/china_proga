import {
  Rating,
  State,
  createEmptyCard,
  fsrs,
  generatorParameters,
  type Card as FsrsCard,
  type ReviewLog,
} from "ts-fsrs";
import type { Card, FsrsCardSnapshot, FsrsStateLabel, ReviewGrade } from "@/lib/types";
import { clamp, diffInDays } from "@/lib/utils";

const DAY_MS = 1000 * 60 * 60 * 24;

const fsrsScheduler = fsrs(
  generatorParameters({
    request_retention: 0.9,
    maximum_interval: 3650,
    enable_fuzz: false,
    enable_short_term: true,
  }),
);

const STATE_TO_LABEL: Record<State, FsrsStateLabel> = {
  [State.New]: "New",
  [State.Learning]: "Learning",
  [State.Review]: "Review",
  [State.Relearning]: "Relearning",
};

const LABEL_TO_STATE: Record<FsrsStateLabel, State> = {
  New: State.New,
  Learning: State.Learning,
  Review: State.Review,
  Relearning: State.Relearning,
};

function normalizeDate(value: string | Date | null | undefined, fallback: Date) {
  if (!value) {
    return fallback;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function inferLegacyState(raw: Partial<Card>) {
  if ((raw.repetitions ?? 0) === 0 && raw.status === "new") {
    return State.New;
  }

  if (raw.status === "review") {
    return State.Relearning;
  }

  if ((raw.interval ?? 0) >= 1 || raw.status === "mastered") {
    return State.Review;
  }

  return State.Learning;
}

export function serializeFsrsCard(card: FsrsCard): FsrsCardSnapshot {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: STATE_TO_LABEL[card.state],
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

export function deserializeFsrsCard(snapshot: FsrsCardSnapshot | undefined, now = new Date()): FsrsCard {
  if (!snapshot) {
    return createEmptyCard(now);
  }

  const due = normalizeDate(snapshot.due, now);
  const lastReview = snapshot.last_review ? normalizeDate(snapshot.last_review, now) : undefined;

  return {
    due,
    stability: clamp(snapshot.stability ?? 0, 0.001, 36500),
    difficulty: clamp(snapshot.difficulty ?? 5, 1, 10),
    elapsed_days: Math.max(0, Math.round(snapshot.elapsed_days ?? 0)),
    scheduled_days: Math.max(0, Math.round(snapshot.scheduled_days ?? 0)),
    learning_steps: Math.max(0, Math.round(snapshot.learning_steps ?? 0)),
    reps: Math.max(0, Math.round(snapshot.reps ?? 0)),
    lapses: Math.max(0, Math.round(snapshot.lapses ?? 0)),
    state: LABEL_TO_STATE[snapshot.state ?? "New"],
    last_review: lastReview,
  };
}

export function createInitialFsrsSnapshot(now = new Date()) {
  return serializeFsrsCard(createEmptyCard(now));
}

export function migrateLegacyFsrsSnapshot(raw: Partial<Card>, now = new Date()) {
  const createdAt = normalizeDate(raw.createdAt, now);
  const fallbackLastReview = raw.lastSeenAt ?? raw.lastCorrectAt ?? raw.createdAt ?? createdAt.toISOString();
  const lastReview = normalizeDate(fallbackLastReview, createdAt);
  const due = normalizeDate(raw.nextReviewAt, now);
  const dueAfterLastReview = Math.max(0, diffInDays(lastReview, due));
  const intervalDays = Math.max(raw.interval ?? 0, dueAfterLastReview);
  const memoryStrength = raw.memoryStrength ?? 28;
  const forgettingScore = raw.forgettingScore ?? 12;
  const mistakes = raw.mistakes ?? 0;
  const state = inferLegacyState(raw);

  const stability = clamp(
    intervalDays > 0 ? intervalDays : 0.35 + memoryStrength / 18,
    0.1,
    36500,
  );
  const difficulty = clamp(4.6 + mistakes * 0.55 + forgettingScore / 40 - memoryStrength / 55, 1, 10);

  return serializeFsrsCard({
    due,
    stability,
    difficulty,
    elapsed_days: Math.max(0, Math.round(diffInDays(lastReview, now))),
    scheduled_days: Math.max(0, Math.round(intervalDays)),
    learning_steps: state === State.New ? 0 : 1,
    reps: Math.max(0, raw.repetitions ?? 0),
    lapses: Math.max(0, mistakes),
    state,
    last_review: raw.lastSeenAt || raw.lastCorrectAt ? lastReview : undefined,
  });
}

export function ensureFsrsSnapshot(raw: Partial<Card>, now = new Date()) {
  if (raw.fsrs) {
    return serializeFsrsCard(deserializeFsrsCard(raw.fsrs, now));
  }

  return migrateLegacyFsrsSnapshot(raw, now);
}

function toFsrsRating(grade: ReviewGrade) {
  if (grade === "again") {
    return Rating.Again;
  }

  if (grade === "hard") {
    return Rating.Hard;
  }

  return Rating.Good;
}

export function reviewWithFsrs(snapshot: FsrsCardSnapshot, grade: ReviewGrade, now = new Date()) {
  const record = fsrsScheduler.next(deserializeFsrsCard(snapshot, now), now, toFsrsRating(grade));

  return {
    snapshot: serializeFsrsCard(record.card),
    log: record.log,
  };
}

export function getFsrsRetrievability(snapshot: FsrsCardSnapshot, now = new Date()) {
  if (snapshot.state === "New" && snapshot.reps === 0 && !snapshot.last_review) {
    return 0.08;
  }

  const value = fsrsScheduler.get_retrievability(deserializeFsrsCard(snapshot, now), now, false);
  return Number.isFinite(value) ? clamp(value, 0, 1) : 0.08;
}

export function getFsrsDueDate(snapshot: FsrsCardSnapshot, now = new Date()) {
  return normalizeDate(snapshot.due, now);
}

export function getFsrsDaysUntilDue(snapshot: FsrsCardSnapshot, now = new Date()) {
  return (getFsrsDueDate(snapshot, now).getTime() - now.getTime()) / DAY_MS;
}

export function deriveFsrsMemoryStrength(snapshot: FsrsCardSnapshot, now = new Date()) {
  if (snapshot.state === "New" && snapshot.reps === 0 && !snapshot.last_review) {
    return 8;
  }

  const retrievability = getFsrsRetrievability(snapshot, now);
  const stabilityFactor = clamp(
    Math.log1p(deserializeFsrsCard(snapshot, now).stability) / Math.log1p(45),
    0,
    1,
  );

  return Math.round(clamp(retrievability * 0.7 + stabilityFactor * 0.3, 0, 1) * 100);
}

export function deriveFsrsForgettingScore(snapshot: FsrsCardSnapshot, now = new Date()) {
  if (snapshot.state === "New" && snapshot.reps === 0 && !snapshot.last_review) {
    return 12;
  }

  return Math.round((1 - getFsrsRetrievability(snapshot, now)) * 100);
}

export function deriveFsrsEaseFactor(snapshot: FsrsCardSnapshot, now = new Date()) {
  const difficulty = deserializeFsrsCard(snapshot, now).difficulty;
  return clamp(3.2 - difficulty * 0.2, 1.3, 3.1);
}

export function deriveFsrsInterval(snapshot: FsrsCardSnapshot, now = new Date()) {
  const fsrsCard = deserializeFsrsCard(snapshot, now);
  if (fsrsCard.scheduled_days > 0) {
    return fsrsCard.scheduled_days;
  }

  return clamp((fsrsCard.due.getTime() - now.getTime()) / DAY_MS, 0, 36500);
}

export function getFsrsLogDue(log: ReviewLog) {
  return log.due.toISOString();
}

