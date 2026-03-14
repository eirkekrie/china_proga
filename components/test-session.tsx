"use client";

import { useEffect, useRef, useState } from "react";
import { HanziHandwritingAnswer, type HandwritingAnswerState } from "@/components/hanzi-handwriting-answer";
import { PronunciationChecker } from "@/components/pronunciation-checker";
import { useStudy } from "@/context/study-context";
import { pronunciationEngine } from "@/lib/audio";
import { REVIEW_GRADE_LABELS, STAGE_LABELS, STAGE_SHORT_LABELS } from "@/lib/constants";
import { compareAnswer, formatDuration, shuffleArray } from "@/lib/utils";
import type { Card, DerivedCard, LearningStage, PronunciationAssessment, ReviewGrade, TestOption } from "@/lib/types";

const modes: LearningStage[] = [
  "hanzi_to_translation",
  "translation_to_hanzi",
  "hanzi_to_pinyin",
  "hanzi_to_pronunciation",
];

type HintFlags = {
  pinyin: boolean;
  audio: boolean;
};

const AUDIO_SOURCE_LABELS = {
  wav: "wav",
} as const;

function buildOptions(cards: Card[], currentCard: DerivedCard, mode: LearningStage) {
  const distractors = shuffleArray(cards.filter((card) => card.id !== currentCard.id)).slice(0, 3);
  const toOption = (card: Card): TestOption => {
    const value = mode === "translation_to_hanzi" ? card.hanzi : card.translation;
    return {
      id: card.id,
      label: value,
      value,
    };
  };

  return shuffleArray([currentCard, ...distractors].map(toOption));
}

function hasHintUsed(hints: HintFlags) {
  return hints.pinyin || hints.audio;
}

export function TestSession() {
  const { addStudyTime, answerCard, cards, getQueue, hydrated, stats } = useStudy();
  const [mode, setMode] = useState<LearningStage>("hanzi_to_translation");
  const [translationAnswerMode, setTranslationAnswerMode] = useState<"choice" | "handwriting">("choice");
  const queue = getQueue("test", mode);

  const [currentCardId, setCurrentCardId] = useState<string | null>(null);
  const [cooldownIds, setCooldownIds] = useState<string[]>([]);
  const [choiceOptions, setChoiceOptions] = useState<TestOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [showPinyinHint, setShowPinyinHint] = useState(false);
  const [hintFlags, setHintFlags] = useState<HintFlags>({ pinyin: false, audio: false });
  const [result, setResult] = useState<{ isCorrect: boolean; expected: string; grade: ReviewGrade } | null>(null);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [audioSource, setAudioSource] = useState<keyof typeof AUDIO_SOURCE_LABELS | null>(null);
  const [pronunciationAssessment, setPronunciationAssessment] = useState<PronunciationAssessment | null>(null);
  const [handwritingState, setHandwritingState] = useState<HandwritingAnswerState | null>(null);
  const startedAtRef = useRef(0);
  const addStudyTimeRef = useRef(addStudyTime);

  const currentCard =
    queue.find((card) => card.id === currentCardId) ??
    queue.find((card) => !cooldownIds.includes(card.id)) ??
    queue[0] ??
    null;

  useEffect(() => {
    setCurrentCardId(null);
    setSelectedOption(null);
    setTextAnswer("");
    setShowPinyinHint(false);
    setHintFlags({ pinyin: false, audio: false });
    setResult(null);
    setAudioNotice(null);
    setAudioSource(null);
    setPronunciationAssessment(null);
    setHandwritingState(null);

    if (mode !== "translation_to_hanzi") {
      setTranslationAnswerMode("choice");
    }
  }, [mode]);

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
    setSelectedOption(null);
    setTextAnswer("");
    setShowPinyinHint(false);
    setHintFlags({ pinyin: false, audio: false });
    setResult(null);
    setAudioNotice(null);
    setAudioSource(null);
    setPronunciationAssessment(null);
    setHandwritingState(null);
  }, [currentCard?.id]);

  useEffect(() => {
    if (mode !== "translation_to_hanzi") {
      return;
    }

    setSelectedOption(null);
    setResult(null);
    setHandwritingState(null);
  }, [mode, translationAnswerMode]);

  useEffect(() => {
    if (!currentCard || (mode !== "hanzi_to_translation" && mode !== "translation_to_hanzi")) {
      setChoiceOptions([]);
      return;
    }

    setChoiceOptions(buildOptions(cards, currentCard, mode));
  }, [cards, currentCard?.id, mode]);

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

  async function handleAudioHint() {
    if (!currentCard) {
      return;
    }

    setAudioNotice(null);
    const playback = await pronunciationEngine.play(currentCard);
    setAudioSource(playback.source);

    if (playback.played) {
      markHintUsed("audio");
      return;
    }

    setAudioNotice(
      "Для этой карточки не найден предзаписанный wav-файл. Сгенерируйте аудио через scripts/generate_card_audio.py.",
    );
  }

  function handleSubmit() {
    if (!currentCard) {
      return;
    }

    const responseTimeMs = Math.max(800, Math.round(performance.now() - startedAtRef.current));
    const hintUsed = hasHintUsed(hintFlags);
    let isCorrect = false;
    let grade: ReviewGrade = "again";

    if (mode === "hanzi_to_translation" || (mode === "translation_to_hanzi" && translationAnswerMode === "choice")) {
      isCorrect = selectedOption === (mode === "translation_to_hanzi" ? currentCard.hanzi : currentCard.translation);
      grade = isCorrect ? (hintUsed || responseTimeMs > 12000 ? "hard" : "good") : "again";
    } else if (mode === "translation_to_hanzi") {
      isCorrect = Boolean(handwritingState?.isReady);
      grade =
        isCorrect && handwritingState
          ? hintUsed || responseTimeMs > 12000 || handwritingState.totalMistakes > 0
            ? "hard"
            : "good"
          : "again";
    } else if (mode === "hanzi_to_pronunciation") {
      if (!pronunciationAssessment) {
        return;
      }

      grade = hintUsed && pronunciationAssessment.grade === "good" ? "hard" : pronunciationAssessment.grade;
      isCorrect = grade !== "again";
    } else {
      isCorrect = compareAnswer(mode, textAnswer, currentCard);
      grade = isCorrect ? (hintUsed || responseTimeMs > 12000 ? "hard" : "good") : "again";
    }

    answerCard(currentCard.id, grade, responseTimeMs);
    setResult({
      isCorrect,
      expected:
        mode === "translation_to_hanzi"
          ? currentCard.hanzi
          : mode === "hanzi_to_translation"
            ? currentCard.translation
            : currentCard.pinyin,
      grade,
    });
  }

  function handleNext() {
    if (!currentCard) {
      return;
    }

    setCooldownIds((previous) => [...previous.filter((id) => id !== currentCard.id), currentCard.id].slice(-2));
    setCurrentCardId(null);
  }

  if (!hydrated) {
    return <div className="glass-panel p-8 text-sm muted-text">Загружаю тестовые данные…</div>;
  }

  if (!currentCard) {
    return (
      <section className="glass-panel p-8">
        <h1 className="text-3xl font-semibold tracking-[-0.04em]">Тест</h1>
        <p className="mt-3 max-w-2xl muted-text">
          Недостаточно карточек, которые дошли до выбранного режима. Сначала пройдите этапы обучения или импортируйте
          больше слов.
        </p>
      </section>
    );
  }

  const promptLead = mode === "translation_to_hanzi" ? currentCard.translation : currentCard.hanzi;
  const isPronunciationMode = mode === "hanzi_to_pronunciation";
  const isHandwritingMode = mode === "translation_to_hanzi" && translationAnswerMode === "handwriting";
  const hintUsed = hasHintUsed(hintFlags);
  const placeholder = mode === "hanzi_to_pinyin" ? "Введите пиньинь" : "Введите произношение / пиньинь";
  const supportLine = mode === "hanzi_to_pinyin" ? currentCard.translation : null;

  return (
    <div className="grid gap-6">
      <section className="glass-panel grid gap-4 p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-7">
        <div>
          <span className="pill mb-4">Тест</span>
          <h1 className="text-3xl font-semibold tracking-[-0.05em]">Проверка по режимам</h1>
          <p className="mt-2 max-w-3xl text-sm muted-text">
            Отдельный режим для целевой проверки каждого этапа: смысл, обратное вспоминание иероглифа, пиньинь и
            произношение.
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
            {modes.map((stage) => {
              const active = stage === mode;
              return (
                <button
                  key={stage}
                  type="button"
                  className={[
                    "rounded-full px-4 py-2 text-sm font-medium transition",
                    active
                      ? "bg-[rgba(var(--accent),0.18)] text-[rgb(var(--accent))]"
                      : "bg-white/5 text-[rgba(var(--foreground),0.72)] hover:bg-white/10",
                  ].join(" ")}
                  onClick={() => setMode(stage)}
                >
                  {STAGE_SHORT_LABELS[stage]}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="glass-panel p-6 sm:p-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <span className="pill">{STAGE_LABELS[mode]}</span>
                <p className="mt-4 text-sm uppercase tracking-[0.18em] subtle-text">Задание</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                  {mode === "translation_to_hanzi"
                    ? isHandwritingMode
                      ? "Напишите иероглиф по переводу"
                      : "Выберите иероглиф по переводу"
                    : mode === "hanzi_to_translation"
                      ? "Выберите правильный перевод"
                      : isPronunciationMode
                        ? "Произнесите слово по иероглифу"
                        : "Введите пиньинь"}
                </p>
                <p className="mt-2 text-xs uppercase tracking-[0.16em] subtle-text">
                  Подсказки открываются только по требованию
                </p>
                {mode === "translation_to_hanzi" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={translationAnswerMode === "choice" ? "btn-secondary" : "btn-ghost"}
                      onClick={() => setTranslationAnswerMode("choice")}
                    >
                      Выбор
                    </button>
                    <button
                      type="button"
                      className={translationAnswerMode === "handwriting" ? "btn-secondary" : "btn-ghost"}
                      onClick={() => setTranslationAnswerMode("handwriting")}
                    >
                      Письмо
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="flex h-fit flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={showPinyinHint}
                  onClick={handleShowPinyinHint}
                >
                  {showPinyinHint ? "Пиньинь открыт" : "Показать пиньинь"}
                </button>
                <button type="button" className="btn-ghost" onClick={handleAudioHint}>
                  Голосовая подсказка
                </button>
              </div>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 text-center">
              <p className="display-hanzi text-[clamp(3.4rem,10vw,6rem)] font-semibold leading-none">{promptLead}</p>

              {isPronunciationMode || showPinyinHint ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {showPinyinHint ? (
                    <div className="rounded-[22px] border border-white/10 bg-black/10 p-4 text-left">
                      <p className="subtle-text text-xs uppercase tracking-[0.16em]">Пиньинь</p>
                      <p className="mt-3 text-2xl font-semibold">{currentCard.pinyin}</p>
                    </div>
                  ) : null}
                  {isPronunciationMode ? (
                    <div className="rounded-[22px] border border-white/10 bg-black/10 p-4 text-left">
                      <p className="subtle-text text-xs uppercase tracking-[0.16em]">Перевод</p>
                      <p className="mt-3 text-lg font-semibold">{currentCard.translation}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {supportLine ? <p className="mt-3 muted-text">{supportLine}</p> : null}
            </div>

            {isHandwritingMode ? (
              <HanziHandwritingAnswer hanzi={currentCard.hanzi} onChange={setHandwritingState} />
            ) : choiceOptions.length > 0 ? (
              <div className="grid gap-3">
                {choiceOptions.map((option) => (
                  <button
                    key={`${option.id}-${option.value}`}
                    type="button"
                    disabled={Boolean(result)}
                    className={[
                      "rounded-[22px] border px-4 py-4 text-left text-base transition",
                      selectedOption === option.value
                        ? "border-[rgba(var(--accent),0.42)] bg-[rgba(var(--accent),0.14)]"
                        : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10",
                    ].join(" ")}
                    onClick={() => setSelectedOption(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : isPronunciationMode ? (
              <PronunciationChecker card={currentCard} onAssessmentChange={setPronunciationAssessment} />
            ) : (
              <div className="grid gap-3">
                <input
                  value={textAnswer}
                  onChange={(event) => setTextAnswer(event.target.value)}
                  placeholder={placeholder}
                  className="rounded-[22px] border border-white/10 bg-black/10 px-4 py-4 text-base outline-none transition focus:border-[rgba(var(--accent),0.45)] focus:ring-2 focus:ring-[rgba(var(--accent),0.16)]"
                />
              </div>
            )}

            {audioNotice && !result ? <p className="text-sm text-[rgb(var(--accent))]">{audioNotice}</p> : null}
            {audioSource && !result ? (
              <div className="pill w-fit border-[rgba(var(--accent),0.24)] bg-[rgba(var(--accent),0.1)] text-[rgb(var(--accent))]">
                Источник озвучки: {AUDIO_SOURCE_LABELS[audioSource]}
              </div>
            ) : null}
            {hintUsed && !result ? (
              <p className="text-sm text-[rgb(var(--warning))]">
                Подсказки использованы. Верный ответ будет засчитан максимум как «Трудно».
              </p>
            ) : null}
            {isHandwritingMode && handwritingState && !result ? (
              <p className="text-sm muted-text">
                Рукописный ответ: {handwritingState.completedCharacters}/{handwritingState.totalCharacters} знаков · ошибок{" "}
                {handwritingState.totalMistakes}.
              </p>
            ) : null}

            {result ? (
              <div
                className={[
                  "rounded-[28px] border p-5",
                  result.isCorrect
                    ? "border-[rgba(var(--success),0.28)] bg-[rgba(var(--success),0.08)]"
                    : "border-[rgba(var(--danger),0.28)] bg-[rgba(var(--danger),0.08)]",
                ].join(" ")}
              >
                <p className="text-lg font-semibold">{result.isCorrect ? "Верно" : "Нужен повтор"}</p>
                <p className="mt-2 text-sm muted-text">Правильный ответ: {result.expected}</p>
                <p className="mt-2 text-sm muted-text">
                  Пиньинь: {currentCard.pinyin} · Перевод: {currentCard.translation}
                </p>
                {hintUsed ? (
                  <p className="mt-2 text-sm text-[rgb(var(--warning))]">
                    Для этой карточки использовались подсказки, поэтому максимум оценки ограничен уровнем «Трудно».
                  </p>
                ) : null}
                {isPronunciationMode && pronunciationAssessment ? (
                  <p className="mt-2 text-sm muted-text">
                    SenseVoice: {pronunciationAssessment.overallScore}% · рекомендация{" "}
                    {REVIEW_GRADE_LABELS[pronunciationAssessment.grade]}.
                  </p>
                ) : null}
                {audioNotice ? <p className="mt-2 text-sm text-[rgb(var(--accent))]">{audioNotice}</p> : null}
                {audioSource ? (
                  <div className="pill mt-3 w-fit border-[rgba(var(--accent),0.24)] bg-[rgba(var(--accent),0.1)] text-[rgb(var(--accent))]">
                    Источник озвучки: {AUDIO_SOURCE_LABELS[audioSource]}
                  </div>
                ) : null}
                <button type="button" className="btn-primary mt-4" onClick={handleNext}>
                  Следующая карточка
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn-primary"
                disabled={
                  mode === "hanzi_to_translation"
                    ? !selectedOption
                    : mode === "translation_to_hanzi"
                      ? isHandwritingMode
                        ? !handwritingState?.isReady
                        : !selectedOption
                    : isPronunciationMode
                      ? !pronunciationAssessment
                      : !textAnswer.trim()
                }
                onClick={handleSubmit}
              >
                {isPronunciationMode
                  ? "Засчитать произношение"
                  : isHandwritingMode
                    ? "Засчитать рукописный ответ"
                    : "Проверить ответ"}
              </button>
            )}
          </div>
        </div>

        <aside className="grid gap-4">
          <div className="glass-panel p-5">
            <p className="text-sm font-semibold">Контекст карточки</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="muted-text">{isPronunciationMode ? "Режим" : "Этап"}</span>
                <strong>{STAGE_SHORT_LABELS[isPronunciationMode ? mode : currentCard.currentStage]}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="muted-text">Ошибок</span>
                <strong>{currentCard.mistakes}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="muted-text">Забывание</span>
                <strong>{Math.round(currentCard.effectiveForgettingScore)}%</strong>
              </div>
              {isPronunciationMode && pronunciationAssessment ? (
                <div className="flex items-center justify-between">
                  <span className="muted-text">Score</span>
                  <strong>{pronunciationAssessment.overallScore}%</strong>
                </div>
              ) : null}
            </div>
          </div>

          <div className="glass-panel p-5 text-sm muted-text">
            <p className="font-semibold text-[rgb(var(--foreground))]">Логика режима</p>
            <p className="mt-3">
              {isPronunciationMode
                ? "Режим произношения доступен сразу для всех карточек, даже если слово ещё новое."
                : "Тест использует реальные этапы карточек и обновляет память так же, как обучение."}
            </p>
            <p className="mt-3">
              Если ответ быстрый и точный, растёт memory strength и сдвигается следующая дата повтора.
            </p>
            <p className="mt-3">При ошибке forgetting score растёт, а карточка снова попадает в повторение.</p>
          </div>
        </aside>
      </section>
    </div>
  );
}

