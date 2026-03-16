import {
  MAX_ACTIVE_LEARNING_CARDS,
  MAX_NEW_CARDS_IN_LEARN_QUEUE,
  STAGE_REQUIRED_STREAK,
  STAGE_SUCCESS_THRESHOLD,
} from "@/lib/constants";
import {
  deriveFsrsEaseFactor,
  deriveFsrsForgettingScore,
  deriveFsrsInterval,
  deriveFsrsMemoryStrength,
  getFsrsDaysUntilDue,
  reviewWithFsrs,
} from "@/lib/fsrs";
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
const coreLearningStages: LearningStage[] = ["hanzi_to_translation", "translation_to_hanzi"];

const overdueRank: Record<DerivedCard["overdueLevel"], number> = {
  fresh: 1,
  soon: 2,
  due: 3,
  critical: 4,
};

export function getStageIndex(stage: LearningStage) {
  return learningStages.indexOf(stage);
}

function getCoreStageIndex(stage: LearningStage) {
  const index = coreLearningStages.indexOf(stage);
  return index >= 0 ? index : coreLearningStages.length - 1;
}

export function getNextStage(stage: LearningStage) {
  const index = coreLearningStages.indexOf(stage);
  return index >= 0 ? coreLearningStages[index + 1] ?? null : null;
}

export function getPreviousStage(stage: LearningStage) {
  const index = coreLearningStages.indexOf(stage);
  return index > 0 ? coreLearningStages[index - 1] : null;
}

export function getOverallProgressPercent(card: Card) {
  if (card.status === "mastered") {
    return 100;
  }

  const stageWeight = 100 / coreLearningStages.length;
  const currentStageProgress = card.stageProgress[card.currentStage] / (100 / stageWeight);
  return clamp(Math.round(getCoreStageIndex(card.currentStage) * stageWeight + currentStageProgress), 0, 100);
}

function computeOverdueLevel(card: Card, effectiveForgettingScore: number, daysUntilDue: number) {
  if (card.status === "new" && card.repetitions === 0) {
    return "fresh" as const;
  }

  if (daysUntilDue <= -7 || effectiveForgettingScore >= 78) {
    return "critical" as const;
  }

  if (daysUntilDue <= 0) {
    return "due" as const;
  }

  if (daysUntilDue <= 1 || effectiveForgettingScore >= 34) {
    return "soon" as const;
  }

  return "fresh" as const;
}

export function getEffectiveCardState(card: Card, now = new Date()): DerivedCard {
  const stageIndex = getCoreStageIndex(card.currentStage);
  const referenceDate = new Date(card.lastSeenAt ?? card.createdAt);
  const daysSinceSeen = diffInDays(referenceDate, now);
  const effectiveMemoryStrength = deriveFsrsMemoryStrength(card.fsrs, now);
  const effectiveForgettingScore = deriveFsrsForgettingScore(card.fsrs, now);
  const daysUntilDue = getFsrsDaysUntilDue(card.fsrs, now);
  const isDue = card.status !== "new" && daysUntilDue <= 0;
  const overdueLevel = computeOverdueLevel(card, effectiveForgettingScore, daysUntilDue);

  let computedStatus: CardStatus = card.status;
  if (card.status === "new" && card.repetitions === 0) {
    computedStatus = "new";
  } else if (card.status === "mastered") {
    computedStatus = isDue ? "review" : "mastered";
  } else {
    computedStatus = isDue || card.status === "review" ? "review" : "learning";
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

function getDaysUntilDue(card: DerivedCard, now = new Date()) {
  if (!card.nextReviewAt) {
    return card.status === "new" ? Number.POSITIVE_INFINITY : 0;
  }

  return (new Date(card.nextReviewAt).getTime() - now.getTime()) / DAY_MS;
}

function compareByUrgency(left: DerivedCard, right: DerivedCard) {
  const leftDaysUntilDue = getDaysUntilDue(left);
  const rightDaysUntilDue = getDaysUntilDue(right);
  const leftOverdueDays = Math.max(0, -leftDaysUntilDue);
  const rightOverdueDays = Math.max(0, -rightDaysUntilDue);

  const leftScore =
    overdueRank[left.overdueLevel] * 100 +
    left.effectiveForgettingScore +
    Math.min(left.daysSinceSeen * 3, 30) +
    Math.min(leftOverdueDays * 8, 48) -
    left.stageIndex * 3;
  const rightScore =
    overdueRank[right.overdueLevel] * 100 +
    right.effectiveForgettingScore +
    Math.min(right.daysSinceSeen * 3, 30) +
    Math.min(rightOverdueDays * 8, 48) -
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
    .filter(
      (card) =>
        (card.status !== "mastered" || card.computedStatus === "review") &&
        (card.computedStatus === "review" || card.overdueLevel === "critical"),
    )
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

  const fsrsReview = reviewWithFsrs(card.fsrs, grade, now);
  const fsrs = fsrsReview.snapshot;
  const nextReviewAt = fsrs.due;

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
    } else {
      status = "mastered";
      currentStage = "translation_to_hanzi";
      stageProgress.translation_to_hanzi = 100;
    }
  }

  if (grade === "again") {
    status = "review";

    const shouldRollback =
      (derived.overdueLevel === "critical" && derived.daysSinceSeen >= 7) ||
      derived.effectiveForgettingScore >= 82 ||
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

  const repetitions = Math.max(card.repetitions + 1, fsrs.reps);
  const totalTimeSpent = card.totalTimeSpent + responseTimeMs;
  const averageResponseTime =
    repetitions > 0 ? Math.round(totalTimeSpent / repetitions) : Math.round(responseTimeMs);

  const memoryStrength = deriveFsrsMemoryStrength(fsrs, now);
  const forgettingScore = deriveFsrsForgettingScore(fsrs, now);
  const easeFactor = deriveFsrsEaseFactor(fsrs, now);
  const interval = deriveFsrsInterval(fsrs, now);

  return {
    ...card,
    status,
    currentStage,
    stageProgress,
    repetitions,
    mistakes,
    streakCorrect,
    easeFactor,
    interval,
    memoryStrength,
    forgettingScore,
    lastSeenAt: now.toISOString(),
    lastCorrectAt: grade === "again" ? card.lastCorrectAt : now.toISOString(),
    nextReviewAt,
    fsrs,
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

    if (card.status !== "new" && (card.isDue || card.effectiveForgettingScore >= 55)) {
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
