import {
  MAX_ACTIVE_LEARNING_CARDS,
  MAX_NEW_CARDS_IN_LEARN_QUEUE,
  STAGE_BASE_INTERVAL_DAYS,
  STAGE_REQUIRED_STREAK,
  STAGE_SUCCESS_THRESHOLD,
} from "@/lib/constants";
import {
  learningStages,
  type Card,
  type CardStatus,
  type DashboardMetrics,
  type DerivedCard,
  type LearningStage,
  type ReviewGrade,
  type StudyFlow,
  type StudyStats,
} from "@/lib/types";
import { clamp, diffInDays } from "@/lib/utils";

const DAY_MS = 1000 * 60 * 60 * 24;

const overdueRank: Record<DerivedCard["overdueLevel"], number> = {
  fresh: 1,
  soon: 2,
  due: 3,
  critical: 4,
};

export function getStageIndex(stage: LearningStage) {
  return learningStages.indexOf(stage);
}

export function getNextStage(stage: LearningStage) {
  const index = getStageIndex(stage);
  return learningStages[index + 1] ?? null;
}

export function getPreviousStage(stage: LearningStage) {
  const index = getStageIndex(stage);
  return index > 0 ? learningStages[index - 1] : null;
}

export function getOverallProgressPercent(card: Card) {
  if (card.status === "mastered") {
    return 100;
  }

  const stageWeight = 100 / learningStages.length;
  const currentStageProgress = card.stageProgress[card.currentStage] / (100 / stageWeight);
  return clamp(Math.round(getStageIndex(card.currentStage) * stageWeight + currentStageProgress), 0, 100);
}

export function getEffectiveCardState(card: Card, now = new Date()): DerivedCard {
  const stageIndex = getStageIndex(card.currentStage);
  const referenceDate = new Date(card.lastSeenAt ?? card.createdAt);
  const daysSinceSeen = diffInDays(referenceDate, now);
  const retention = clamp(card.memoryStrength / 100, 0.08, 0.98);
  const forgettingRise = daysSinceSeen * (10 + stageIndex * 3) * (1 - retention * 0.78);
  const memoryDecay = daysSinceSeen * (3.6 - Math.min(card.easeFactor, 3) * 0.72);

  const effectiveForgettingScore = clamp(card.forgettingScore + forgettingRise, 0, 100);
  const effectiveMemoryStrength = clamp(card.memoryStrength - memoryDecay, 0, 100);
  const reviewTimestamp = card.nextReviewAt ? new Date(card.nextReviewAt).getTime() : 0;
  const isDue = !card.nextReviewAt || reviewTimestamp <= now.getTime() || effectiveForgettingScore >= 64;

  let overdueLevel: DerivedCard["overdueLevel"] = "fresh";
  if (effectiveForgettingScore >= 86 || daysSinceSeen >= 14) {
    overdueLevel = "critical";
  } else if (isDue) {
    overdueLevel = "due";
  } else if (effectiveForgettingScore >= 34 || daysSinceSeen >= 3) {
    overdueLevel = "soon";
  }

  let computedStatus: CardStatus = card.status;
  if (card.status === "mastered" && (isDue || effectiveForgettingScore >= 60)) {
    computedStatus = "review";
  } else if (card.status === "new" && card.repetitions > 0) {
    computedStatus = "learning";
  } else if (card.status !== "new" && card.status !== "mastered" && isDue) {
    computedStatus = "review";
  } else if (card.status !== "new" && card.status !== "mastered") {
    computedStatus = "learning";
  }

  return {
    ...card,
    effectiveMemoryStrength,
    effectiveForgettingScore,
    daysSinceSeen,
    isDue,
    overdueLevel,
    computedStatus,
    overallProgressPercent: getOverallProgressPercent(card),
    stageIndex,
  };
}

function compareByUrgency(left: DerivedCard, right: DerivedCard) {
  const leftScore =
    overdueRank[left.overdueLevel] * 100 +
    left.effectiveForgettingScore +
    Math.min(left.daysSinceSeen * 4, 35) -
    left.stageIndex * 3;
  const rightScore =
    overdueRank[right.overdueLevel] * 100 +
    right.effectiveForgettingScore +
    Math.min(right.daysSinceSeen * 4, 35) -
    right.stageIndex * 3;

  return rightScore - leftScore;
}

export function pickCardFromQueue(
  queue: DerivedCard[],
  recentIds: string[],
  rotationIndex: number,
  windowSize: number,
) {
  if (queue.length === 0) {
    return null;
  }

  const eligibleCards = queue.filter((card) => !recentIds.includes(card.id));
  const sourceCards = eligibleCards.length > 0 ? eligibleCards : queue;
  const poolSize = clamp(windowSize, 1, sourceCards.length);
  const rotationPool = sourceCards.slice(0, poolSize);

  return rotationPool[rotationIndex % rotationPool.length] ?? sourceCards[0] ?? null;
}

export function buildStudyQueue(
  cards: Card[],
  flow: StudyFlow,
  now = new Date(),
  forcedStage?: LearningStage,
) {
  const derivedCards = cards.map((card) => getEffectiveCardState(card, now));

  if (flow === "review") {
    return derivedCards
      .filter((card) => card.isDue || card.computedStatus === "review" || card.effectiveForgettingScore >= 50)
      .sort(compareByUrgency);
  }

  if (flow === "test") {
    const stage = forcedStage ?? "hanzi_to_translation";
    const minimumStageIndex = getStageIndex(stage);

    if (stage === "hanzi_to_pronunciation") {
      return derivedCards.sort((left, right) => {
        if (left.repetitions !== right.repetitions) {
          return left.repetitions - right.repetitions;
        }

        const urgencyDelta = compareByUrgency(left, right);
        if (urgencyDelta !== 0) {
          return urgencyDelta;
        }

        return left.stageIndex - right.stageIndex;
      });
    }

    return derivedCards
      .filter((card) => {
        if (card.status === "new") {
          return false;
        }

        return (
          card.status === "mastered" ||
          card.currentStage === stage ||
          getStageIndex(card.currentStage) >= minimumStageIndex ||
          card.stageProgress[stage] > 0
        );
      })
      .sort(compareByUrgency);
  }

  const reviewCards = derivedCards
    .filter((card) => (card.status !== "mastered" || card.computedStatus === "review") && (card.computedStatus === "review" || card.overdueLevel === "critical"))
    .sort(compareByUrgency);
  const reviewIds = new Set(reviewCards.map((card) => card.id));

  const activeLearningCards = derivedCards
    .filter(
      (card) =>
        !reviewIds.has(card.id) &&
        card.status !== "new" &&
        card.status !== "mastered" &&
        card.computedStatus === "learning",
    )
    .sort((left, right) => {
      const urgencyDelta = compareByUrgency(left, right);
      if (urgencyDelta !== 0) {
        return urgencyDelta;
      }

      if (left.repetitions !== right.repetitions) {
        return left.repetitions - right.repetitions;
      }

      return left.stageIndex - right.stageIndex;
    })
    .slice(0, MAX_ACTIVE_LEARNING_CARDS);

  const shouldIntroduceNewCards = activeLearningCards.length < MAX_ACTIVE_LEARNING_CARDS;
  const newCards = shouldIntroduceNewCards
    ? derivedCards
        .filter((card) => !reviewIds.has(card.id) && card.status === "new")
        .sort((left, right) => {
          if (left.repetitions !== right.repetitions) {
            return left.repetitions - right.repetitions;
          }

          return left.createdAt.localeCompare(right.createdAt);
        })
        .slice(0, MAX_NEW_CARDS_IN_LEARN_QUEUE)
    : [];

  return [...reviewCards, ...activeLearningCards, ...newCards];
}

function calculateNextIntervalDays(
  previousInterval: number,
  grade: ReviewGrade,
  easeFactor: number,
  memoryStrength: number,
  stage: LearningStage,
) {
  const base = STAGE_BASE_INTERVAL_DAYS[stage];

  if (grade === "again") {
    return 0.2;
  }

  if (grade === "hard") {
    return clamp(
      Math.max(base * 0.75, previousInterval > 0 ? previousInterval * 0.65 : base * 0.8),
      0.45,
      14,
    );
  }

  const multiplier = 1 + memoryStrength / 220;
  const next = previousInterval > 0 ? previousInterval * easeFactor * multiplier : base * multiplier;
  return clamp(Math.max(base, next), 0.75, 45);
}

export function applyReview(card: Card, grade: ReviewGrade, responseTimeMs: number, now = new Date()) {
  const derived = getEffectiveCardState(card, now);
  const activeStage = card.currentStage;
  const stageProgress = { ...card.stageProgress };

  stageProgress[activeStage] = clamp(
    stageProgress[activeStage] + { again: -26, hard: 18, good: 36 }[grade],
    0,
    100,
  );

  let currentStage = activeStage;
  let status: CardStatus = card.status === "new" ? "learning" : derived.computedStatus;
  let streakCorrect = grade === "again" ? 0 : card.streakCorrect + 1;
  let mistakes = card.mistakes + (grade === "again" ? 1 : 0);
  let memoryStrength = clamp(
    derived.effectiveMemoryStrength + { again: -18, hard: 8, good: 16 }[grade],
    0,
    100,
  );
  let forgettingScore = clamp(
    derived.effectiveForgettingScore + { again: 24, hard: -8, good: -18 }[grade],
    0,
    100,
  );
  let easeFactor = clamp(card.easeFactor + { again: -0.2, hard: -0.04, good: 0.08 }[grade], 1.3, 3.1);

  const nextInterval = calculateNextIntervalDays(card.interval, grade, easeFactor, memoryStrength, activeStage);
  let nextReviewAt = new Date(now.getTime() + nextInterval * DAY_MS).toISOString();

  if (
    grade !== "again" &&
    stageProgress[activeStage] >= STAGE_SUCCESS_THRESHOLD[activeStage] &&
    streakCorrect >= STAGE_REQUIRED_STREAK[activeStage]
  ) {
    const nextStage = getNextStage(activeStage);

    if (nextStage) {
      currentStage = nextStage;
      streakCorrect = 0;
      status = "learning";
      forgettingScore = clamp(forgettingScore - 10, 0, 100);
      nextReviewAt = new Date(now.getTime() + Math.max(0.75, nextInterval) * DAY_MS).toISOString();
    } else {
      status = "mastered";
      nextReviewAt = new Date(now.getTime() + Math.max(5, nextInterval * 1.35) * DAY_MS).toISOString();
    }
  }

  if (grade === "again") {
    status = "review";

    const shouldRollback =
      (derived.overdueLevel === "critical" && derived.daysSinceSeen >= 7) ||
      forgettingScore >= 86 ||
      mistakes >= 4;

    if (shouldRollback) {
      const previousStage = getPreviousStage(activeStage);
      stageProgress[activeStage] = clamp(stageProgress[activeStage] - 20, 0, 100);

      if (previousStage) {
        currentStage = previousStage;
        stageProgress[previousStage] = clamp(stageProgress[previousStage] - 12, 18, 100);
      }
    }
  } else if (grade === "hard" && derived.overdueLevel === "critical") {
    status = "review";
  }

  const repetitions = card.repetitions + 1;
  const totalTimeSpent = card.totalTimeSpent + responseTimeMs;
  const averageResponseTime =
    repetitions > 0 ? Math.round(totalTimeSpent / repetitions) : Math.round(responseTimeMs);

  return {
    ...card,
    status,
    currentStage,
    stageProgress,
    repetitions,
    mistakes,
    streakCorrect,
    easeFactor,
    interval: nextInterval,
    memoryStrength,
    forgettingScore,
    lastSeenAt: now.toISOString(),
    lastCorrectAt: grade === "again" ? card.lastCorrectAt : now.toISOString(),
    nextReviewAt,
    totalTimeSpent,
    averageResponseTime,
  };
}

export function computeDashboard(cards: Card[], _stats: StudyStats, now = new Date()): DashboardMetrics {
  const derivedCards = cards.map((card) => getEffectiveCardState(card, now));
  const stageBreakdown: DashboardMetrics["stageBreakdown"] = {
    hanzi_to_translation: 0,
    translation_to_hanzi: 0,
    hanzi_to_pinyin: 0,
    hanzi_to_pronunciation: 0,
  };

  let newCount = 0;
  let learningCount = 0;
  let reviewCount = 0;
  let masteredCount = 0;
  let dueTodayCount = 0;
  let progressTotal = 0;

  derivedCards.forEach((card) => {
    stageBreakdown[card.currentStage] += 1;
    progressTotal += card.overallProgressPercent;

    if (card.status === "new") {
      newCount += 1;
    } else if (card.status === "learning") {
      learningCount += 1;
    } else if (card.status === "mastered") {
      masteredCount += 1;
    }

    if (card.computedStatus === "review") {
      reviewCount += 1;
    }

    if (card.isDue || card.effectiveForgettingScore >= 55) {
      dueTodayCount += 1;
    }
  });

  return {
    totalCards: cards.length,
    newCount,
    learningCount,
    reviewCount,
    masteredCount,
    dueTodayCount,
    progressPercent: cards.length > 0 ? Math.round(progressTotal / cards.length) : 0,
    stageBreakdown,
  };
}
