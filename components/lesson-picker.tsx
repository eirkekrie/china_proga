"use client";

import { ChevronLeft, ChevronRight, Library } from "lucide-react";
import { useStudy } from "@/context/study-context";
import { ALL_LESSONS_ID, UNASSIGNED_LESSON_ID, UNASSIGNED_LESSON_TITLE } from "@/lib/constants";

export function LessonPicker({ compact = false }: { compact?: boolean }) {
  const { availableLessons, cards, hydrated, metrics, selectedLessonId, setSelectedLessonId } = useStudy();
  const unassignedCount = cards.filter((card) => card.lessonId === UNASSIGNED_LESSON_ID).length;
  const options = [
    { id: ALL_LESSONS_ID, title: "Все уроки", count: cards.length },
    ...(unassignedCount > 0
      ? [{ id: UNASSIGNED_LESSON_ID, title: UNASSIGNED_LESSON_TITLE, count: unassignedCount }]
      : []),
    ...availableLessons.map((lesson) => ({ id: lesson.id, title: lesson.title, count: lesson.count })),
  ];
  const selectedIndex = Math.max(0, options.findIndex((option) => option.id === selectedLessonId));

  function move(direction: -1 | 1) {
    if (options.length <= 1) return;
    const nextIndex = (selectedIndex + direction + options.length) % options.length;
    setSelectedLessonId(options[nextIndex].id);
  }

  return (
    <section className={["context-picker", compact ? "is-compact" : ""].join(" ")}>
      <div className="context-picker-label">
        <Library size={15} />
        <span>Учебный набор</span>
      </div>
      <select
        value={options[selectedIndex]?.id ?? ALL_LESSONS_ID}
        disabled={!hydrated}
        aria-label="Выбрать учебный набор"
        onChange={(event) => setSelectedLessonId(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.title} · {option.count}
          </option>
        ))}
      </select>
      {!compact ? (
        <span className="context-picker-meta">
          {metrics.newCount} новых · {metrics.dueTodayCount} к повтору
        </span>
      ) : null}
      <div className="context-picker-arrows">
        <button type="button" disabled={!hydrated || options.length <= 1} aria-label="Предыдущий урок" onClick={() => move(-1)}>
          <ChevronLeft size={16} />
        </button>
        <button type="button" disabled={!hydrated || options.length <= 1} aria-label="Следующий урок" onClick={() => move(1)}>
          <ChevronRight size={16} />
        </button>
      </div>
    </section>
  );
}
