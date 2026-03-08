"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PronunciationChecker } from "@/components/pronunciation-checker";
import { useStudy } from "@/context/study-context";
import { pronunciationEngine } from "@/lib/audio";
import { REVIEW_GRADE_LABELS, STAGE_HINTS, STAGE_LABELS, STAGE_PROMPTS } from "@/lib/constants";
import { formatDuration, formatRelativeDue } from "@/lib/utils";
import type { DerivedCard, PronunciationAssessment, ReviewGrade, StudyFlow } from "@/lib/types";

type StudySessionProps = {
  flow: Extract<StudyFlow, "learn" | "review">;
  title: string;
  description: string;
};

type HintFlags = {
  pinyin: boolean;
  audio: boolean;
};

const buttonStyles: Record<ReviewGrade, string> = {
  again: "btn-danger",
  hard: "btn-secondary",
  good: "btn-primary",
};

function getPrompt(card: DerivedCard) {
  switch (card.currentStage) {
    case "translation_to_hanzi":
      return {
        lead: card.translation,
        question: STAGE_PROMPTS[card.currentStage],
        answer: card.hanzi,
      };
    case "hanzi_to_pinyin":
      return {
        lead: card.hanzi,
        question: STAGE_PROMPTS[card.currentStage],
        answer: card.pinyin,
      };
    case "hanzi_to_pronunciation":
      return {
        lead: card.hanzi,
        question: STAGE_PROMPTS[card.currentStage],
        answer: card.pinyin,
      };
    default:
      return {
        lead: card.hanzi,
        question: STAGE_PROMPTS[card.currentStage],
        answer: card.translation,
      };
  }
}

function hasHintUsed(hints: HintFlags) {
  return hints.pinyin || hints.audio;
}

export function StudySession({ flow, title, description }: StudySessionProps) {
  const { addStudyTime, answerCard, getQueue, hydrated, metrics, stats } = useStudy();
  const queue = getQueue(flow);

  const [currentCardId, setCurrentCardId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [showPinyinHint, setShowPinyinHint] = useState(false);
  const [flashGrade, setFlashGrade] = useState<ReviewGrade | null>(null);
  const [cooldownIds, setCooldownIds] = useState<string[]>([]);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [pronunciationAssessment, setPronunciationAssessment] = useState<PronunciationAssessment | null>(null);
  const [hintFlags, setHintFlags] = useState<HintFlags>({ pinyin: false, audio: false });
  const startedAtRef = useRef(0);
  const addStudyTimeRef = useRef(addStudyTime);

  const currentCard =
    queue.find((card) => card.id === currentCardId) ??
    queue.find((card) => !cooldownIds.includes(card.id)) ??
    queue[0] ??
    null;

  useEffect(() => {
    if (!currentCardId && currentCard) {
      setCurrentCardId(currentCard.id);
      return;
    }

    if (currentCardId && !queue.some((card) => card.id === currentCardId)) {
      const nextCard = queue.find((card) => !cooldownIds.includes(card.id)) ?? queue[0] ?? null;
      setCurrentCardId(nextCard?.id ?? null);
    }
  }, [cooldownIds, currentCard, currentCardId, queue]);

  useEffect(() => {
    if (!currentCard) {
      return;
    }

    startedAtRef.current = performance.now();
    setRevealed(false);
    setShowPinyinHint(false);
    setFlashGrade(null);
    setAudioNotice(null);
    setPronunciationAssessment(null);
    setHintFlags({ pinyin: false, audio: false });
  }, [currentCard?.id]);

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

  function markHintUsed(kind: keyof HintFlags) {
    setHintFlags((previous) => {
      if (previous[kind]) {
        return previous;
      }

      return {
        ...previous,
        [kind]: true,
      };
    });
  }

  function handleShowPinyinHint() {
    setShowPinyinHint(true);
    markHintUsed("pinyin");
  }

  async function handlePlayPronunciation() {
    if (!currentCard) {
      return;
    }

    setAudioNotice(null);
    const played = await pronunciationEngine.play(currentCard);
    if (played) {
      markHintUsed("audio");
      return;
    }

    setAudioNotice(
      "Не удалось запустить ни готовое аудио, ни локальный Qwen3-TTS, ни системный голос браузера.",
    );
  }

  function handleGrade(grade: ReviewGrade) {
    if (!currentCard) {
      return;
    }

    const responseTimeMs = Math.max(800, Math.round(performance.now() - startedAtRef.current));
    const effectiveGrade = hasHintUsed(hintFlags) && grade === "good" ? "hard" : grade;

    answerCard(currentCard.id, effectiveGrade, responseTimeMs);
    setFlashGrade(effectiveGrade);
    setCooldownIds((previous) => [...previous.filter((id) => id !== currentCard.id), currentCard.id].slice(-2));

    window.setTimeout(() => {
      setCurrentCardId(null);
    }, 280);
  }

  if (!hydrated) {
    return <div className="glass-panel p-8 text-sm muted-text">Загружаю карточки и локальную статистику…</div>;
  }

  if (!currentCard) {
    return (
      <section className="glass-panel p-8 sm:p-10">
        <div className="flex flex-col gap-4">
          <span className="pill w-fit">Очередь пуста</span>
          <h1 className="text-3xl font-semibold tracking-[-0.04em]">{title}</h1>
          <p className="max-w-2xl muted-text">
            На сегодня нет карточек для этого режима. Можно открыть тест, посмотреть все карточки или импортировать
            новый набор слов.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/" className="btn-primary">
              На главную
            </Link>
            <Link href="/test" className="btn-secondary">
              Перейти в тест
            </Link>
            <Link href="/cards" className="btn-secondary">
              Все карточки
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const prompt = getPrompt(currentCard);
  const isPronunciationStage = currentCard.currentStage === "hanzi_to_pronunciation";
  const hintUsed = hasHintUsed(hintFlags);
  const cardClass =
    flashGrade === "good"
      ? "status-good"
      : flashGrade === "hard"
        ? "status-hard"
        : flashGrade === "again"
          ? "status-again"
          : "";

  return (
    <div className="grid gap-6">
      <section className="glass-panel grid gap-4 p-6 sm:grid-cols-[1.1fr_0.9fr] sm:p-7">
        <div className="flex flex-col gap-4">
          <span className="pill w-fit">{flow === "review" ? "Повторение" : "Обучение"}</span>
          <h1 className="text-3xl font-semibold tracking-[-0.05em]">{title}</h1>
          <p className="max-w-3xl text-sm muted-text">{description}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
            <p className="subtle-text text-xs uppercase tracking-[0.18em]">В очереди</p>
            <p className="mt-3 text-2xl font-semibold">{queue.length}</p>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
            <p className="subtle-text text-xs uppercase tracking-[0.18em]">На сегодня</p>
            <p className="mt-3 text-2xl font-semibold">{metrics.dueTodayCount}</p>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
            <p className="subtle-text text-xs uppercase tracking-[0.18em]">Сессия</p>
            <p className="mt-3 text-2xl font-semibold">{formatDuration(stats.sessionStudyTime)}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flip-scene">
          <div className={`flip-card ${revealed ? "is-flipped" : ""} ${cardClass}`}>
            <div className="flip-face glass-panel p-6 sm:p-8">
              <div className="flex h-full flex-col gap-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <span className="pill">{STAGE_LABELS[currentCard.currentStage]}</span>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] subtle-text">Вопрос</p>
                      <p className="mt-2 text-lg font-medium">{prompt.question}</p>
                    </div>
                  </div>

                  <span
                    className={[
                      "rounded-full px-3 py-1 text-xs font-semibold",
                      currentCard.overdueLevel === "critical"
                        ? "bg-[rgba(var(--danger),0.14)] text-[rgb(var(--danger))]"
                        : currentCard.overdueLevel === "due"
                          ? "bg-[rgba(var(--warning),0.14)] text-[rgb(var(--warning))]"
                          : "bg-[rgba(var(--success),0.12)] text-[rgb(var(--success))]",
                    ].join(" ")}
                  >
                    {currentCard.overdueLevel === "critical"
                      ? "Сильное забывание"
                      : currentCard.overdueLevel === "due"
                        ? "Пора повторять"
                        : "В активной памяти"}
                  </span>
                </div>

                <div className="flex flex-col items-center justify-center gap-4 py-6 text-center">
                  <p className="display-hanzi text-[clamp(4rem,14vw,8rem)] font-semibold leading-none tracking-tight">
                    {prompt.lead}
                  </p>

                  <div className="grid w-full max-w-3xl gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      className="btn-secondary w-full justify-between px-5 py-4 text-left disabled:cursor-default disabled:opacity-100"
                      disabled={showPinyinHint}
                      onClick={handleShowPinyinHint}
                    >
                      {showPinyinHint ? "Пиньинь открыт" : "Показать пиньинь"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost w-full justify-between px-5 py-4 text-left"
                      onClick={handlePlayPronunciation}
                    >
                      Голосовая подсказка
                    </button>
                  </div>

                  <button
                    type="button"
                    className="btn-primary w-full max-w-xl px-6 py-4 text-base shadow-[0_20px_48px_rgba(var(--accent),0.32)]"
                    onClick={() => setRevealed(true)}
                  >
                    Показать ответ
                  </button>

                  {showPinyinHint ? (
                    <div className="rounded-[24px] border border-white/10 bg-white/5 px-5 py-4">
                      <p className="subtle-text text-xs uppercase tracking-[0.16em]">Пиньинь</p>
                      <p className="mt-2 text-2xl font-semibold">{currentCard.pinyin}</p>
                    </div>
                  ) : null}

                  {audioNotice ? <p className="text-sm text-[rgb(var(--accent))]">{audioNotice}</p> : null}

                  <p className="max-w-xl text-sm muted-text">
                    Карточка показывает текущий этап освоения. Сначала смысл, затем обратное вспоминание, чтение и
                    произношение.
                  </p>
                </div>

                <div className="mt-auto space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="muted-text">Прогресс этапа</span>
                        <span>{currentCard.stageProgress[currentCard.currentStage]}%</span>
                      </div>
                      <div className="progress-track h-3">
                        <div className="meter-bar h-full" style={{ width: `${currentCard.stageProgress[currentCard.currentStage]}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="muted-text">Забывание</span>
                        <span>{Math.round(currentCard.effectiveForgettingScore)}%</span>
                      </div>
                      <div className="progress-track h-3">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-400 to-rose-400"
                          style={{ width: `${Math.round(currentCard.effectiveForgettingScore)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <button type="button" className="hidden" onClick={() => setRevealed(true)}>
                    Показать ответ
                  </button>
                </div>
              </div>
            </div>

            <div className="flip-face flip-back glass-panel p-6 sm:p-8">
              <div className="flex h-full flex-col justify-between">
                <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                  <div>
                    <span className="pill mb-4">{STAGE_LABELS[currentCard.currentStage]}</span>
                    <p className="text-xs uppercase tracking-[0.18em] subtle-text">Правильный ответ</p>
                    <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">{prompt.answer}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] subtle-text">
                      Готовый аудиофайл, локальный Qwen3-TTS или системный голос
                    </p>
                  </div>

                  <div className="flex h-fit flex-wrap gap-2">
                    <button type="button" className="btn-ghost" onClick={() => setRevealed(false)}>
                      Назад к вопросу
                    </button>
                    <button type="button" className="btn-secondary" onClick={handlePlayPronunciation}>
                      Прослушать
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                    <p className="subtle-text text-xs uppercase tracking-[0.18em]">Пиньинь</p>
                    <p className="mt-3 text-2xl font-semibold">{currentCard.pinyin}</p>
                  </div>
                  <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                    <p className="subtle-text text-xs uppercase tracking-[0.18em]">Перевод</p>
                    <p className="mt-3 text-xl font-semibold">{currentCard.translation}</p>
                  </div>
                </div>

                {isPronunciationStage ? (
                  <PronunciationChecker card={currentCard} onAssessmentChange={setPronunciationAssessment} compact />
                ) : null}

                <div className="grid gap-4 rounded-[28px] border border-white/10 bg-white/5 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-medium">Подсказка по текущему этапу</p>
                    <span className="text-sm muted-text">{formatRelativeDue(currentCard.nextReviewAt)}</span>
                  </div>
                  <p className="text-sm muted-text">{STAGE_HINTS[currentCard.currentStage]}</p>
                  {hintUsed ? (
                    <p className="text-sm text-[rgb(var(--warning))]">
                      Использованы подсказки. Ответ будет засчитан максимум как «Трудно».
                    </p>
                  ) : null}
                  {pronunciationAssessment ? (
                    <p className="text-sm muted-text">
                      SenseVoice рекомендует: <strong>{REVIEW_GRADE_LABELS[pronunciationAssessment.grade]}</strong> · score{" "}
                      {pronunciationAssessment.overallScore}%.
                    </p>
                  ) : null}
                  {currentCard.overdueLevel === "critical" ? (
                    <p className="text-sm text-[rgb(var(--danger))]">
                      Карточка давно не повторялась. При ошибке система может откатить её на предыдущий этап.
                    </p>
                  ) : null}
                  {audioNotice ? <p className="text-sm text-[rgb(var(--accent))]">{audioNotice}</p> : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {(["again", "hard", "good"] as ReviewGrade[]).map((grade) => (
                    <button key={grade} type="button" className={buttonStyles[grade]} onClick={() => handleGrade(grade)}>
                      {REVIEW_GRADE_LABELS[grade]}
                    </button>
                  ))}
                </div>

                {pronunciationAssessment ? (
                  <button
                    type="button"
                    className="btn-ghost w-full"
                    onClick={() => handleGrade(pronunciationAssessment.grade)}
                  >
                    Использовать оценку SenseVoice: {REVIEW_GRADE_LABELS[pronunciationAssessment.grade]}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <aside className="grid gap-4">
          <div className="glass-panel p-5">
            <p className="text-sm font-semibold">Память карточки</p>
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="muted-text">Memory strength</span>
                  <span>{Math.round(currentCard.effectiveMemoryStrength)}%</span>
                </div>
                <div className="progress-track h-3">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                    style={{ width: `${Math.round(currentCard.effectiveMemoryStrength)}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="muted-text">Показов</span>
                <strong>{currentCard.repetitions}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="muted-text">Ошибок</span>
                <strong>{currentCard.mistakes}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="muted-text">Время на карточку</span>
                <strong>{formatDuration(currentCard.totalTimeSpent)}</strong>
              </div>
            </div>
          </div>

          <div className="glass-panel p-5">
            <p className="text-sm font-semibold">Что дальше</p>
            <div className="mt-4 space-y-3 text-sm muted-text">
              <p>1 день без повторения даёт мягкое снижение памяти.</p>
              <p>3 дня поднимают forgetting score заметно сильнее.</p>
              <p>7 дней переводят карточку в приоритетное повторение.</p>
              <p>14+ дней и ошибка могут откатить этап назад.</p>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
