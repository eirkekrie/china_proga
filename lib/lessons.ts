import { UNASSIGNED_LESSON_ID } from "@/lib/constants";
import { getEffectiveCardState } from "@/lib/learning";
import type { Card, LessonSummary } from "@/lib/types";

function getLessonNumber(title: string) {
  const match = title.match(/\d+/);
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
}

function sortLessons(left: LessonSummary, right: LessonSummary) {
  const leftNumber = getLessonNumber(left.title);
  const rightNumber = getLessonNumber(right.title);

  if (leftNumber !== rightNumber) {
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
    if (Number.isFinite(leftNumber)) return -1;
    if (Number.isFinite(rightNumber)) return 1;
  }

  return left.title.localeCompare(right.title, "ru", { numeric: true, sensitivity: "base" });
}

export function buildAvailableLessons(cards: Card[]): LessonSummary[] {
  const lessons = new Map<string, LessonSummary>();
  const now = new Date();

  cards.forEach((card) => {
    if (card.lessonId === UNASSIGNED_LESSON_ID) return;

    const derived = getEffectiveCardState(card, now);
    const existing = lessons.get(card.lessonId);

    if (existing) {
      existing.count += 1;
      existing.newCount += card.status === "new" ? 1 : 0;
      existing.learningCount += card.status === "learning" ? 1 : 0;
      existing.reviewCount += derived.computedStatus === "review" ? 1 : 0;
      existing.masteredCount += card.status === "mastered" ? 1 : 0;
      existing.progressPercent += derived.overallProgressPercent;
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
