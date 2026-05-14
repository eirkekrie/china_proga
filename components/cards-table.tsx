"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  STAGE_LABELS,
  STATUS_LABELS,
  UNASSIGNED_LESSON_ID,
  UNASSIGNED_LESSON_TITLE,
} from "@/lib/constants";
import { getEffectiveCardState } from "@/lib/learning";
import { useStudy } from "@/context/study-context";
import { formatDateTime, formatDuration } from "@/lib/utils";
import type { Card, CardStatus, DerivedCard, LearningStage, LessonSummary } from "@/lib/types";

type FilterValue = "all" | CardStatus | "hard";
type SortValue = "due" | "forgetting" | "memory" | "time" | "alphabetical";
type LessonChoice = "unassigned" | "new" | string;
type CardFormState = {
  hanzi: string;
  pinyin: string;
  translation: string;
  lessonChoice: LessonChoice;
  newLessonTitle: string;
};

function getVisibleLessonTitle(card: { lessonId: string; lessonTitle: string }) {
  return card.lessonId === UNASSIGNED_LESSON_ID ? null : card.lessonTitle;
}

function createLessonSlug(label: string) {
  const slug = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return `lesson-${slug || "custom"}`;
}

function normalizeLessonInput(rawTitle: string) {
  const trimmed = rawTitle.trim();
  if (!trimmed) {
    return {
      lessonId: UNASSIGNED_LESSON_ID,
      lessonTitle: UNASSIGNED_LESSON_TITLE,
    };
  }

  const title = /^\d+$/.test(trimmed) ? `Урок ${trimmed}` : trimmed;
  return {
    lessonId: createLessonSlug(title.replace(/^урок\s+/i, "")),
    lessonTitle: title,
  };
}

function getLessonFromChoice(
  lessonChoice: LessonChoice,
  newLessonTitle: string,
  availableLessons: LessonSummary[],
) {
  if (lessonChoice === "unassigned") {
    return {
      lessonId: UNASSIGNED_LESSON_ID,
      lessonTitle: UNASSIGNED_LESSON_TITLE,
    };
  }

  if (lessonChoice === "new") {
    return normalizeLessonInput(newLessonTitle);
  }

  const lesson = availableLessons.find((entry) => entry.id === lessonChoice);
  return lesson
    ? {
        lessonId: lesson.id,
        lessonTitle: lesson.title,
      }
    : {
        lessonId: UNASSIGNED_LESSON_ID,
        lessonTitle: UNASSIGNED_LESSON_TITLE,
      };
}

function buildEditForm(card: Card): CardFormState {
  return {
    hanzi: card.hanzi,
    pinyin: card.pinyin,
    translation: card.translation,
    lessonChoice: card.lessonId === UNASSIGNED_LESSON_ID ? "unassigned" : card.lessonId,
    newLessonTitle: "",
  };
}

function sortCards(cards: DerivedCard[], sortBy: SortValue) {
  return [...cards].sort((left, right) => {
    switch (sortBy) {
      case "forgetting":
        return right.effectiveForgettingScore - left.effectiveForgettingScore;
      case "memory":
        return right.effectiveMemoryStrength - left.effectiveMemoryStrength;
      case "time":
        return right.totalTimeSpent - left.totalTimeSpent;
      case "alphabetical":
        return left.hanzi.localeCompare(right.hanzi, "zh-CN");
      default:
        return right.isDue === left.isDue
          ? right.effectiveForgettingScore - left.effectiveForgettingScore
          : Number(right.isDue) - Number(left.isDue);
    }
  });
}

export function CardsTable() {
  const {
    availableLessons,
    deleteCards,
    filteredCards,
    hydrated,
    moveCardsToLesson,
    resetCardsProgress,
    updateCard,
  } = useStudy();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterValue>("all");
  const [stageFilter, setStageFilter] = useState<LearningStage | "all">("all");
  const [sortBy, setSortBy] = useState<SortValue>("due");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editForm, setEditForm] = useState<CardFormState | null>(null);
  const [bulkLessonChoice, setBulkLessonChoice] = useState<LessonChoice>("unassigned");
  const [bulkNewLessonTitle, setBulkNewLessonTitle] = useState("");
  const deferredSearch = useDeferredValue(search);

  const visibleCards = useMemo(() => {
    return sortCards(
      filteredCards
        .map((card) => getEffectiveCardState(card))
        .filter((card) => {
          const needle = deferredSearch.trim().toLowerCase();
          const matchesSearch =
            !needle ||
            card.hanzi.toLowerCase().includes(needle) ||
            card.pinyin.toLowerCase().includes(needle) ||
            card.translation.toLowerCase().includes(needle) ||
            card.lessonTitle.toLowerCase().includes(needle);

          const matchesStatus =
            statusFilter === "all"
              ? true
              : statusFilter === "hard"
                ? card.mistakes >= 3 || card.effectiveForgettingScore >= 70
                : card.computedStatus === statusFilter || card.status === statusFilter;

          const matchesStage = stageFilter === "all" ? true : card.currentStage === stageFilter;

          return matchesSearch && matchesStatus && matchesStage;
        }),
      sortBy,
    );
  }, [deferredSearch, filteredCards, sortBy, stageFilter, statusFilter]);

  const visibleIds = useMemo(() => visibleCards.map((card) => card.id), [visibleCards]);
  const visibleIdSet = useMemo(() => new Set(visibleIds), [visibleIds]);
  const selectedVisibleIds = selectedIds.filter((id) => visibleIdSet.has(id));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  useEffect(() => {
    setSelectedIds([]);
  }, [deferredSearch, statusFilter, stageFilter]);

  useEffect(() => {
    setSelectedIds((previous) => previous.filter((id) => filteredCards.some((card) => card.id === id)));
  }, [filteredCards]);

  function toggleCard(cardId: string) {
    setSelectedIds((previous) =>
      previous.includes(cardId) ? previous.filter((id) => id !== cardId) : [...previous, cardId],
    );
  }

  function toggleAllVisible() {
    setSelectedIds((previous) => {
      if (allVisibleSelected) {
        return previous.filter((id) => !visibleIdSet.has(id));
      }

      return [...previous.filter((id) => !visibleIdSet.has(id)), ...visibleIds];
    });
  }

  function openEditor(card: Card) {
    setEditingCard(card);
    setEditForm(buildEditForm(card));
  }

  function closeEditor() {
    setEditingCard(null);
    setEditForm(null);
  }

  function handleSaveEdit() {
    if (!editingCard || !editForm) {
      return;
    }

    const hanzi = editForm.hanzi.trim();
    const pinyin = editForm.pinyin.trim();
    const translation = editForm.translation.trim();
    if (!hanzi || !pinyin || !translation) {
      window.alert("Заполните иероглиф, пиньинь и перевод.");
      return;
    }

    if (editForm.lessonChoice === "new" && !editForm.newLessonTitle.trim()) {
      window.alert("Введите название нового урока.");
      return;
    }

    updateCard(editingCard.id, {
      hanzi,
      pinyin,
      translation,
      ...getLessonFromChoice(editForm.lessonChoice, editForm.newLessonTitle, availableLessons),
    });
    closeEditor();
  }

  function handleDelete(cardIds: string[]) {
    if (cardIds.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      cardIds.length === 1
        ? "Удалить эту карточку окончательно?"
        : `Удалить карточки окончательно: ${cardIds.length}?`,
    );
    if (!confirmed) {
      return;
    }

    deleteCards(cardIds);
    setSelectedIds((previous) => previous.filter((id) => !cardIds.includes(id)));
  }

  function handleReset(cardIds: string[]) {
    if (cardIds.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      cardIds.length === 1
        ? "Сбросить прогресс этой карточки?"
        : `Сбросить прогресс карточек: ${cardIds.length}?`,
    );
    if (!confirmed) {
      return;
    }

    resetCardsProgress(cardIds);
  }

  function handleMove(cardIds: string[]) {
    if (cardIds.length === 0) {
      return;
    }

    if (bulkLessonChoice === "new" && !bulkNewLessonTitle.trim()) {
      window.alert("Введите название нового урока.");
      return;
    }

    const lesson = getLessonFromChoice(bulkLessonChoice, bulkNewLessonTitle, availableLessons);
    moveCardsToLesson(cardIds, lesson);
  }

  if (!hydrated) {
    return <div className="glass-panel p-8 text-sm muted-text">Загружаю карточки...</div>;
  }

  return (
    <div className="grid gap-6">
      <section className="glass-panel p-6 sm:p-7">
        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr_0.7fr_0.7fr]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по иероглифу, пиньиню, переводу или уроку"
            className="rounded-[22px] border border-white/10 bg-black/10 px-4 py-3 outline-none transition focus:border-[rgba(var(--accent),0.45)] focus:ring-2 focus:ring-[rgba(var(--accent),0.16)]"
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as FilterValue)}
            className="rounded-[22px] border border-white/10 bg-black/10 px-4 py-3 outline-none"
          >
            <option value="all">Все статусы</option>
            <option value="new">Новые</option>
            <option value="learning">В изучении</option>
            <option value="review">В повторении</option>
            <option value="mastered">Освоенные</option>
            <option value="hard">Трудные</option>
          </select>

          <select
            value={stageFilter}
            onChange={(event) => setStageFilter(event.target.value as LearningStage | "all")}
            className="rounded-[22px] border border-white/10 bg-black/10 px-4 py-3 outline-none"
          >
            <option value="all">Все этапы</option>
            <option value="hanzi_to_translation">Stage 1</option>
            <option value="translation_to_hanzi">Stage 2</option>
            <option value="hanzi_to_pinyin">Пиньинь</option>
          </select>

          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortValue)}
            className="rounded-[22px] border border-white/10 bg-black/10 px-4 py-3 outline-none"
          >
            <option value="due">Сначала к повторению</option>
            <option value="forgetting">По забыванию</option>
            <option value="memory">По памяти</option>
            <option value="time">По времени</option>
            <option value="alphabetical">По иероглифу</option>
          </select>
        </div>
      </section>

      <section className="glass-panel p-5 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
          <div className="flex flex-wrap items-center gap-3">
            <label className="btn-secondary cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[rgb(var(--accent))]"
                checked={allVisibleSelected}
                onChange={toggleAllVisible}
              />
              Все видимые: {visibleCards.length}
            </label>
            <span className="pill">Выбрано: {selectedVisibleIds.length}</span>
            <button type="button" className="btn-ghost" onClick={() => setSelectedIds([])}>
              Очистить выбор
            </button>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_auto_auto_auto]">
            <select
              value={bulkLessonChoice}
              onChange={(event) => setBulkLessonChoice(event.target.value)}
              className="rounded-[22px] border border-white/10 bg-black/10 px-4 py-3 text-sm outline-none"
            >
              <option value="unassigned">Без урока</option>
              {availableLessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.title}
                </option>
              ))}
              <option value="new">Новый урок</option>
            </select>
            <input
              value={bulkNewLessonTitle}
              onChange={(event) => setBulkNewLessonTitle(event.target.value)}
              disabled={bulkLessonChoice !== "new"}
              placeholder="Например: 13 или Урок 13"
              className="rounded-[22px] border border-white/10 bg-black/10 px-4 py-3 text-sm outline-none disabled:opacity-45"
            />
            <button type="button" className="btn-secondary" onClick={() => handleMove(selectedVisibleIds)}>
              Перенести выбранные
            </button>
            <button type="button" className="btn-secondary" onClick={() => handleReset(selectedVisibleIds)}>
              Сбросить выбранные
            </button>
            <button type="button" className="btn-danger" onClick={() => handleDelete(selectedVisibleIds)}>
              Удалить выбранные
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className="btn-ghost" onClick={() => handleMove(visibleIds)}>
            Перенести все видимые
          </button>
          <button type="button" className="btn-ghost" onClick={() => handleReset(visibleIds)}>
            Сбросить все видимые
          </button>
          <button type="button" className="btn-danger" onClick={() => handleDelete(visibleIds)}>
            Удалить все видимые
          </button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {visibleCards.map((card) => (
          <article key={card.id} className="glass-panel p-5 sm:p-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <label className="flex min-w-0 items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-3 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]"
                    checked={selectedIds.includes(card.id)}
                    onChange={() => toggleCard(card.id)}
                  />
                  <span className="min-w-0">
                    <span className="display-hanzi block text-4xl font-semibold">{card.hanzi}</span>
                    <span className="mt-2 block text-lg font-medium">{card.pinyin}</span>
                    <span className="mt-1 block muted-text">{card.translation}</span>
                  </span>
                </label>
                <div className="flex flex-col items-end gap-2 text-sm">
                  <span className="pill">{STATUS_LABELS[card.status]}</span>
                  {getVisibleLessonTitle(card) ? <span className="pill">{getVisibleLessonTitle(card)}</span> : null}
                  <span className="pill">{card.computedStatus === "review" ? "К повторению" : "Стабильно"}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={() => openEditor(card)}>
                  Редактировать
                </button>
                <button type="button" className="btn-ghost px-4 py-2 text-sm" onClick={() => handleReset([card.id])}>
                  Сбросить
                </button>
                <button type="button" className="btn-danger px-4 py-2 text-sm" onClick={() => handleDelete([card.id])}>
                  Удалить
                </button>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm">
                <p className="font-medium">{STAGE_LABELS[card.currentStage]}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center justify-between">
                    <span className="muted-text">Сила памяти</span>
                    <strong>{Math.round(card.effectiveMemoryStrength)}%</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="muted-text">Забывание</span>
                    <strong>{Math.round(card.effectiveForgettingScore)}%</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="muted-text">Ошибок</span>
                    <strong>{card.mistakes}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="muted-text">Показов</span>
                    <strong>{card.repetitions}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="muted-text">Следующий повтор</span>
                    <strong>{formatDateTime(card.nextReviewAt)}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="muted-text">Время на карточку</span>
                    <strong>{formatDuration(card.totalTimeSpent)}</strong>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="muted-text">Этап</span>
                    <span>{card.stageProgress[card.currentStage]}%</span>
                  </div>
                  <div className="progress-track h-3">
                    <div className="meter-bar h-full" style={{ width: `${card.stageProgress[card.currentStage]}%` }} />
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="muted-text">Память</span>
                    <span>{Math.round(card.effectiveMemoryStrength)}%</span>
                  </div>
                  <div className="progress-track h-3">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                      style={{ width: `${Math.round(card.effectiveMemoryStrength)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="muted-text">Забывание</span>
                    <span>{Math.round(card.effectiveForgettingScore)}%</span>
                  </div>
                  <div className="progress-track h-3">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-400 to-rose-400"
                      style={{ width: `${Math.round(card.effectiveForgettingScore)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </article>
        ))}

        {visibleCards.length === 0 ? (
          <div className="glass-panel p-8 text-sm muted-text">По текущим фильтрам карточки не найдены.</div>
        ) : null}
      </section>

      {editingCard && editForm ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm">
          <section className="glass-panel w-full max-w-2xl p-6 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="pill">Редактирование</span>
                <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">{editingCard.hanzi}</h2>
              </div>
              <button type="button" className="btn-ghost px-4 py-2 text-sm" onClick={closeEditor}>
                Закрыть
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              <label className="grid gap-2 text-sm font-semibold">
                Иероглиф
                <input
                  value={editForm.hanzi}
                  onChange={(event) => setEditForm({ ...editForm, hanzi: event.target.value })}
                  className="rounded-[18px] border border-white/10 bg-black/10 px-4 py-3 font-normal outline-none"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Пиньинь
                <input
                  value={editForm.pinyin}
                  onChange={(event) => setEditForm({ ...editForm, pinyin: event.target.value })}
                  className="rounded-[18px] border border-white/10 bg-black/10 px-4 py-3 font-normal outline-none"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Перевод
                <textarea
                  value={editForm.translation}
                  onChange={(event) => setEditForm({ ...editForm, translation: event.target.value })}
                  className="min-h-24 rounded-[18px] border border-white/10 bg-black/10 px-4 py-3 font-normal outline-none"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold">
                  Урок
                  <select
                    value={editForm.lessonChoice}
                    onChange={(event) => setEditForm({ ...editForm, lessonChoice: event.target.value })}
                    className="rounded-[18px] border border-white/10 bg-black/10 px-4 py-3 font-normal outline-none"
                  >
                    <option value="unassigned">Без урока</option>
                    {availableLessons.map((lesson) => (
                      <option key={lesson.id} value={lesson.id}>
                        {lesson.title}
                      </option>
                    ))}
                    <option value="new">Новый урок</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  Новый урок
                  <input
                    value={editForm.newLessonTitle}
                    onChange={(event) => setEditForm({ ...editForm, newLessonTitle: event.target.value })}
                    disabled={editForm.lessonChoice !== "new"}
                    placeholder="Например: 13 или Урок 13"
                    className="rounded-[18px] border border-white/10 bg-black/10 px-4 py-3 font-normal outline-none disabled:opacity-45"
                  />
                </label>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" className="btn-secondary" onClick={closeEditor}>
                Отмена
              </button>
              <button type="button" className="btn-primary" onClick={handleSaveEdit}>
                Сохранить
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
