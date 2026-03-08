"use client";

import { useEffect, useRef, useState } from "react";
import { pronunciationEngine } from "@/lib/audio";
import { useStudy } from "@/context/study-context";
import { buildToneExercises } from "@/lib/tone-training";
import { formatDuration } from "@/lib/utils";
import type { ToneExercise, ToneTrainingMode } from "@/lib/types";

const toneModes: Array<{ id: ToneTrainingMode; label: string; description: string }> = [
  {
    id: "tone_number",
    label: "Тон",
    description: "Определите номер тона по иероглифу, переводу и базовому слогу без акцента.",
  },
  {
    id: "similar_syllable",
    label: "Похожие слоги",
    description: "Выберите правильный вариант среди близких форм вроде ma1 / ma2 / ma3 / ma4.",
  },
];

const toneContours = [
  { tone: 1, label: "1-й тон", contour: "ровный высокий" },
  { tone: 2, label: "2-й тон", contour: "восходящий" },
  { tone: 3, label: "3-й тон", contour: "нисходяще-восходящий" },
  { tone: 4, label: "4-й тон", contour: "резко нисходящий" },
];

function getExpectedLabel(exercise: ToneExercise) {
  return `${exercise.markedSyllable} · ${exercise.numberedSyllable}`;
}

function getModeTaskLabel(mode: ToneTrainingMode) {
  if (mode === "tone_number") {
    return "Определите номер тона";
  }

  return "Выберите правильный слог";
}

export function ToneTrainingSession() {
  const { addStudyTime, cards, hydrated, stats } = useStudy();
  const [mode, setMode] = useState<ToneTrainingMode>("tone_number");
  const [exercisePool, setExercisePool] = useState<ToneExercise[]>([]);
  const [currentExerciseId, setCurrentExerciseId] = useState<string | null>(null);
  const [cooldownIds, setCooldownIds] = useState<string[]>([]);
  const [selectedValue, setSelectedValue] = useState<string | null>(null);
  const [result, setResult] = useState<{ isCorrect: boolean; expected: string } | null>(null);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [sessionCompleted, setSessionCompleted] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const addStudyTimeRef = useRef(addStudyTime);

  const queue = exercisePool.filter((exercise) => exercise.mode === mode);
  const currentExercise =
    queue.find((exercise) => exercise.id === currentExerciseId) ??
    queue.find((exercise) => !cooldownIds.includes(exercise.id)) ??
    queue[0] ??
    null;
  const currentCard = cards.find((card) => card.id === currentExercise?.cardId) ?? null;
  const accuracy = sessionCompleted > 0 ? Math.round((sessionCorrect / sessionCompleted) * 100) : 0;

  useEffect(() => {
    setExercisePool(buildToneExercises(cards));
  }, [cards]);

  useEffect(() => {
    setCurrentExerciseId(null);
    setCooldownIds([]);
    setSelectedValue(null);
    setResult(null);
    setAudioNotice(null);
  }, [mode]);

  useEffect(() => {
    if (!currentExerciseId && currentExercise) {
      setCurrentExerciseId(currentExercise.id);
      return;
    }

    if (currentExerciseId && !queue.some((exercise) => exercise.id === currentExerciseId)) {
      const nextExercise = queue.find((exercise) => !cooldownIds.includes(exercise.id)) ?? queue[0] ?? null;
      setCurrentExerciseId(nextExercise?.id ?? null);
    }
  }, [cooldownIds, currentExercise, currentExerciseId, queue]);

  useEffect(() => {
    setSelectedValue(null);
    setResult(null);
    setAudioNotice(null);
  }, [currentExercise?.id]);

  useEffect(() => {
    addStudyTimeRef.current = addStudyTime;
  }, [addStudyTime]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        addStudyTimeRef.current(1000);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  async function handlePreview() {
    if (!currentCard) {
      return;
    }

    setAudioNotice(null);
    const played = await pronunciationEngine.play(currentCard);
    if (!played) {
      setAudioNotice(
        "Не удалось воспроизвести аудио. Проверьте готовые файлы, локальный Qwen TTS или системный китайский голос браузера.",
      );
    }
  }

  function handleSubmit() {
    if (!currentExercise || !selectedValue) {
      return;
    }

    const expectedValue = mode === "tone_number" ? String(currentExercise.tone) : currentExercise.numberedSyllable;
    const isCorrect = selectedValue === expectedValue;

    setResult({
      isCorrect,
      expected: getExpectedLabel(currentExercise),
    });
    setSessionCompleted((value) => value + 1);
    if (isCorrect) {
      setSessionCorrect((value) => value + 1);
    }
  }

  function handleNext() {
    if (!currentExercise) {
      return;
    }

    setCooldownIds((previous) => [...previous.filter((id) => id !== currentExercise.id), currentExercise.id].slice(-5));
    setCurrentExerciseId(null);
  }

  if (!hydrated) {
    return <div className="glass-panel p-8 text-sm muted-text">Загружаю тоновые упражнения…</div>;
  }

  if (!currentExercise) {
    return (
      <section className="glass-panel p-8">
        <h1 className="text-3xl font-semibold tracking-[-0.04em]">Тоновые тренировки</h1>
        <p className="mt-3 max-w-2xl muted-text">
          Пока недостаточно односложных карточек с тонами 1-4. Импортируйте больше базовых слов, и тренировка
          автоматически соберёт семьи слогов вроде ma1 / ma2 / ma3 / ma4.
        </p>
      </section>
    );
  }

  return (
    <div className="grid gap-6">
      <section className="glass-panel grid gap-4 p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-7">
        <div>
          <span className="pill mb-4">Мини-режим</span>
          <h1 className="text-3xl font-semibold tracking-[-0.05em]">Тоновые тренировки</h1>
          <p className="mt-2 max-w-3xl text-sm muted-text">
            Отдельная сессия для тонов и близких слогов. Упражнения собираются автоматически из односложных карточек и
            помогают не путать ma1 / ma2 / ma3 / ma4 и похожие контуры.
          </p>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm">
          <p className="muted-text">Сессия</p>
          <p className="mt-2 text-2xl font-semibold">{formatDuration(stats.sessionStudyTime)}</p>
        </div>
      </section>

      <section className="glass-panel p-5 sm:p-6">
        <div className="thin-scrollbar overflow-x-auto">
          <div className="flex min-w-max gap-2">
            {toneModes.map((toneMode) => {
              const active = toneMode.id === mode;
              return (
                <button
                  key={toneMode.id}
                  type="button"
                  className={[
                    "rounded-full px-4 py-2 text-sm font-medium transition",
                    active
                      ? "bg-[rgba(var(--accent),0.18)] text-[rgb(var(--accent))]"
                      : "bg-white/5 text-[rgba(var(--foreground),0.72)] hover:bg-white/10",
                  ].join(" ")}
                  onClick={() => setMode(toneMode.id)}
                >
                  {toneMode.label}
                </button>
              );
            })}
          </div>
        </div>
        <p className="mt-4 text-sm muted-text">{toneModes.find((toneMode) => toneMode.id === mode)?.description}</p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="glass-panel p-6 sm:p-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <span className="pill">{mode === "tone_number" ? "Номер тона" : "Сходные слоги"}</span>
                <p className="mt-4 text-sm uppercase tracking-[0.18em] subtle-text">Задание</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{getModeTaskLabel(mode)}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.16em] subtle-text">
                  Иероглиф, смысл, базовый слог и прослушивание эталона
                </p>
              </div>

              <button type="button" className="btn-secondary h-fit" onClick={handlePreview}>
                Прослушать
              </button>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
              <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr] md:items-center">
                <div>
                  <p className="display-hanzi text-[clamp(3.6rem,11vw,6.6rem)] font-semibold leading-none">
                    {currentExercise.hanzi}
                  </p>
                  <p className="mt-4 text-lg font-semibold">{currentExercise.translation}</p>
                </div>

                <div className="grid gap-3">
                  <div className="rounded-[22px] border border-white/10 bg-black/10 p-4">
                    <p className="subtle-text text-xs uppercase tracking-[0.16em]">Слог без тона</p>
                    <p className="mt-3 text-2xl font-semibold">{currentExercise.baseSyllable}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              {currentExercise.options.map((option) => (
                <button
                  key={`${currentExercise.id}-${option.value}`}
                  type="button"
                  disabled={Boolean(result)}
                  className={[
                    "rounded-[22px] border px-4 py-4 text-left transition",
                    selectedValue === option.value
                      ? "border-[rgba(var(--accent),0.42)] bg-[rgba(var(--accent),0.14)]"
                      : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10",
                  ].join(" ")}
                  onClick={() => setSelectedValue(option.value)}
                >
                  <p className="text-base font-semibold">{option.label}</p>
                  {option.helper ? <p className="mt-1 text-sm muted-text">{option.helper}</p> : null}
                </button>
              ))}
            </div>

            {audioNotice && !result ? <p className="text-sm text-[rgb(var(--accent))]">{audioNotice}</p> : null}

            {result ? (
              <div
                className={[
                  "rounded-[28px] border p-5",
                  result.isCorrect
                    ? "border-[rgba(var(--success),0.28)] bg-[rgba(var(--success),0.08)]"
                    : "border-[rgba(var(--danger),0.28)] bg-[rgba(var(--danger),0.08)]",
                ].join(" ")}
              >
                <p className="text-lg font-semibold">{result.isCorrect ? "Верно" : "Нужно повторить"}</p>
                <p className="mt-2 text-sm muted-text">
                  Правильный ответ: {mode === "tone_number" ? `${currentExercise.tone}-й тон` : result.expected}
                </p>
                <p className="mt-2 text-sm muted-text">Эталон: {result.expected}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {currentExercise.family.map((entry) => (
                    <span key={`${currentExercise.id}-${entry.tone}`} className="pill">
                      {entry.marked}
                      <strong>{entry.numbered}</strong>
                    </span>
                  ))}
                </div>
                {audioNotice ? <p className="mt-3 text-sm text-[rgb(var(--accent))]">{audioNotice}</p> : null}
                <button type="button" className="btn-primary mt-4" onClick={handleNext}>
                  Следующее упражнение
                </button>
              </div>
            ) : (
              <button type="button" className="btn-primary" disabled={!selectedValue} onClick={handleSubmit}>
                Проверить ответ
              </button>
            )}
          </div>
        </div>

        <aside className="grid gap-4">
          <div className="glass-panel p-5">
            <p className="text-sm font-semibold">Сессия</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="muted-text">Доступно</span>
                <strong>{queue.length}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="muted-text">Пройдено</span>
                <strong>{sessionCompleted}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="muted-text">Верно</span>
                <strong>{sessionCorrect}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="muted-text">Точность</span>
                <strong>{accuracy}%</strong>
              </div>
            </div>
          </div>

          <div className="glass-panel p-5 text-sm muted-text">
            <p className="font-semibold text-[rgb(var(--foreground))]">Подсказка по тонам</p>
            <div className="mt-4 space-y-3">
              {toneContours.map((item) => (
                <div key={item.tone} className="flex items-center justify-between gap-3">
                  <span>{item.label}</span>
                  <strong>{item.contour}</strong>
                </div>
              ))}
            </div>
            <p className="mt-4">
              Тренировка не двигает карточки по стадиям и не ломает forgetting curve. Это отдельный быстрый режим для
              слуха и тоновой опоры.
            </p>
          </div>
        </aside>
      </section>
    </div>
  );
}
