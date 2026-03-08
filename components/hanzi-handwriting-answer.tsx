"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { extractHanziCharacters } from "@/lib/utils";

type HanziWriterLike = {
  cancelQuiz?: () => void;
  quiz?: (options?: Record<string, unknown>) => Promise<unknown>;
};

export type HandwritingAnswerState = {
  isReady: boolean;
  answer: string;
  totalCharacters: number;
  completedCharacters: number;
  totalMistakes: number;
};

type HanziHandwritingAnswerProps = {
  hanzi: string;
  onChange?: (state: HandwritingAnswerState) => void;
  title?: string;
  description?: string;
  resetLabel?: string;
  readyMessage?: string;
  showHintAfterMisses?: number | false;
};

export function HanziHandwritingAnswer({
  hanzi,
  onChange,
  title = "Рукописный ответ",
  description = "Напишите иероглифы рукой. Ответ засчитается после завершения всех знаков.",
  resetLabel = "Начать заново",
  readyMessage = "Рукописный ответ готов к проверке.",
  showHintAfterMisses = 2,
}: HanziHandwritingAnswerProps) {
  const characters = useMemo(() => extractHanziCharacters(hanzi), [hanzi]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [completed, setCompleted] = useState<boolean[]>([]);
  const [totalMistakes, setTotalMistakes] = useState(0);
  const [currentMistakes, setCurrentMistakes] = useState(0);
  const [resetToken, setResetToken] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const writerRef = useRef<HanziWriterLike | null>(null);

  useEffect(() => {
    setActiveIndex(0);
    setCompleted(Array.from({ length: characters.length }, () => false));
    setTotalMistakes(0);
    setCurrentMistakes(0);
    setResetToken(0);
    setError(null);
  }, [characters.length, hanzi]);

  useEffect(() => {
    const completedCharacters = completed.filter(Boolean).length;
    onChange?.({
      isReady: characters.length > 0 && completedCharacters === characters.length,
      answer: characters.join(""),
      totalCharacters: characters.length,
      completedCharacters,
      totalMistakes: totalMistakes + currentMistakes,
    });
  }, [characters, completed, currentMistakes, onChange, totalMistakes]);

  useEffect(() => {
    if (!characters.length || !containerRef.current || completed.every(Boolean)) {
      return;
    }

    let disposed = false;
    const currentCharacter = characters[activeIndex];

    async function bootWriter() {
      setIsLoading(true);
      setError(null);
      setCurrentMistakes(0);

      try {
        const { default: HanziWriter } = await import("hanzi-writer");
        if (disposed || !containerRef.current) {
          return;
        }

        containerRef.current.innerHTML = "";
        const writer = HanziWriter.create(containerRef.current, currentCharacter, {
          width: 240,
          height: 240,
          padding: 18,
          showOutline: false,
          showCharacter: false,
          strokeColor: "#f8fafc",
          outlineColor: "#334155",
          drawingColor: "#f59e0b",
          highlightColor: "#38bdf8",
          drawingWidth: 5,
        });

        writerRef.current = writer;
        setIsLoading(false);

        void writer.quiz?.({
          leniency: 1,
          showHintAfterMisses,
          highlightOnComplete: true,
          onMistake: (strokeData: { totalMistakes: number }) => {
            if (!disposed) {
              setCurrentMistakes(strokeData.totalMistakes);
            }
          },
          onComplete: (summary: { totalMistakes: number }) => {
            if (disposed) {
              return;
            }

            setTotalMistakes((value) => value + summary.totalMistakes);
            setCurrentMistakes(0);
            setCompleted((previous) => previous.map((value, index) => (index === activeIndex ? true : value)));
            setActiveIndex((index) => Math.min(index + 1, Math.max(0, characters.length - 1)));
            setResetToken((value) => value + 1);
          },
        });
      } catch (cause) {
        if (!disposed) {
          setIsLoading(false);
          setError(cause instanceof Error ? cause.message : "Не удалось запустить рукописный ввод.");
        }
      }
    }

    void bootWriter();

    return () => {
      disposed = true;
      writerRef.current?.cancelQuiz?.();
      writerRef.current = null;

      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [activeIndex, characters, completed, resetToken, showHintAfterMisses]);

  if (!characters.length) {
    return null;
  }

  const completedCharacters = completed.filter(Boolean).length;
  const isReady = completedCharacters === characters.length;

  return (
    <div className="grid gap-4 rounded-[28px] border border-white/10 bg-white/5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-sm muted-text">{description}</p>
        </div>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setActiveIndex(0);
            setCompleted(Array.from({ length: characters.length }, () => false));
            setTotalMistakes(0);
            setCurrentMistakes(0);
            setResetToken((value) => value + 1);
          }}
        >
          {resetLabel}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {characters.map((character, index) => (
          <div
            key={`${character}-${index}`}
            className={[
              "rounded-full border px-3 py-2 text-sm font-medium",
              index === activeIndex && !completed[index]
                ? "border-[rgba(var(--accent),0.42)] bg-[rgba(var(--accent),0.14)] text-[rgb(var(--accent))]"
                : completed[index]
                  ? "border-[rgba(var(--success),0.4)] bg-[rgba(var(--success),0.08)] text-[rgb(var(--success))]"
                  : "border-white/10 bg-black/10",
            ].join(" ")}
          >
            {completed[index] ? "✓" : index + 1}
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <div className="rounded-[24px] border border-white/10 bg-black/10 p-4">
          <p className="subtle-text text-xs uppercase tracking-[0.16em]">Прогресс</p>
          <p className="mt-3 text-3xl font-semibold">
            {completedCharacters}/{characters.length}
          </p>
          <p className="mt-3 text-sm muted-text">
            Текущий знак: <strong>{isReady ? "готово" : activeIndex + 1}</strong>
          </p>
          <p className="mt-2 text-sm muted-text">
            Ошибок в сессии: <strong>{totalMistakes + currentMistakes}</strong>
          </p>
          <p className="mt-2 text-sm muted-text">
            Режим специально не показывает контур, чтобы ответ оставался именно вспоминанием.
          </p>
          {isReady ? <p className="mt-3 text-sm text-[rgb(var(--success))]">{readyMessage}</p> : null}
        </div>

        <div className="rounded-[28px] border border-white/10 bg-[rgba(var(--foreground),0.03)] p-4">
          <div className="soft-grid flex min-h-[18rem] items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-black/10">
            <div ref={containerRef} className="h-[240px] w-[240px]" />
          </div>
          {isLoading ? <p className="mt-3 text-sm muted-text">Подготавливаю поле для письма…</p> : null}
          {error ? <p className="mt-3 text-sm text-[rgb(var(--accent))]">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
