"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { extractHanziCharacters } from "@/lib/utils";

type PracticeMode = "trace" | "free";

type HanziWriterLike = {
  animateCharacter?: () => Promise<unknown>;
  cancelQuiz?: () => void;
  quiz?: (options?: Record<string, unknown>) => Promise<unknown>;
};

type HanziWriterPracticeProps = {
  text: string;
};

export function HanziWritingPractice({ text }: HanziWriterPracticeProps) {
  const characters = useMemo(() => extractHanziCharacters(text), [text]);
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<PracticeMode>("trace");
  const [activeIndex, setActiveIndex] = useState(0);
  const [resetToken, setResetToken] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [completed, setCompleted] = useState<boolean[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const writerRef = useRef<HanziWriterLike | null>(null);

  useEffect(() => {
    setCompleted(Array.from({ length: characters.length }, () => false));
    setActiveIndex(0);
    setResetToken(0);
    setMistakes(0);
    setError(null);
  }, [characters.length, text]);

  useEffect(() => {
    if (!isOpen || !characters.length || !containerRef.current) {
      return;
    }

    let disposed = false;
    const currentCharacter = characters[activeIndex];

    async function bootWriter() {
      setIsLoading(true);
      setError(null);
      setMistakes(0);

      try {
        const { default: HanziWriter } = await import("hanzi-writer");
        if (disposed || !containerRef.current) {
          return;
        }

        containerRef.current.innerHTML = "";
        const writer = HanziWriter.create(containerRef.current, currentCharacter, {
          width: 260,
          height: 260,
          padding: 18,
          showOutline: true,
          showCharacter: mode === "trace",
          strokeColor: "#f8fafc",
          outlineColor: "#475569",
          drawingColor: "#f59e0b",
          highlightColor: "#fb7185",
          delayBetweenStrokes: 120,
          strokeAnimationSpeed: 1.15,
        });

        writerRef.current = writer;
        setIsLoading(false);

        if (mode === "trace") {
          void writer.animateCharacter?.();
        }

        void writer.quiz?.({
          leniency: 1,
          showHintAfterMisses: 2,
          highlightOnComplete: true,
          onMistake: (strokeData: { totalMistakes: number }) => {
            if (!disposed) {
              setMistakes(strokeData.totalMistakes);
            }
          },
          onComplete: (summary: { totalMistakes: number }) => {
            if (disposed) {
              return;
            }

            setMistakes(summary.totalMistakes);
            setCompleted((previous) => previous.map((value, index) => (index === activeIndex ? true : value)));
          },
        });
      } catch (cause) {
        if (!disposed) {
          setIsLoading(false);
          setError(cause instanceof Error ? cause.message : "Не удалось загрузить пропись.");
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
  }, [activeIndex, characters, isOpen, mode, resetToken]);

  if (!characters.length) {
    return null;
  }

  const allCompleted = completed.length > 0 && completed.every(Boolean);
  const currentCharacter = characters[activeIndex];

  return (
    <div className="grid gap-3 rounded-[28px] border border-white/10 bg-white/5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Пропись иероглифа</p>
          <p className="mt-1 text-sm muted-text">Опциональная практика после открытия ответа. На оценку карточки не влияет.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => setIsOpen((value) => !value)}>
          {isOpen ? "Скрыть пропись" : "✍️ Пропись"}
        </button>
      </div>

      {isOpen ? (
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            {characters.map((character, index) => (
              <button
                key={`${character}-${index}`}
                type="button"
                className={[
                  "rounded-full border px-3 py-2 text-sm font-medium transition",
                  index === activeIndex
                    ? "border-[rgba(var(--accent),0.42)] bg-[rgba(var(--accent),0.14)] text-[rgb(var(--accent))]"
                    : completed[index]
                      ? "border-[rgba(var(--success),0.4)] bg-[rgba(var(--success),0.08)] text-[rgb(var(--success))]"
                      : "border-white/10 bg-black/10 hover:bg-white/10",
                ].join(" ")}
                onClick={() => setActiveIndex(index)}
              >
                {character}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={mode === "trace" ? "btn-secondary" : "btn-ghost"}
              onClick={() => setMode("trace")}
            >
              Обвести
            </button>
            <button
              type="button"
              className={mode === "free" ? "btn-secondary" : "btn-ghost"}
              onClick={() => setMode("free")}
            >
              Написать самому
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setCompleted((previous) => previous.map((value, index) => (index === activeIndex ? false : value)));
                setResetToken((value) => value + 1);
              }}
            >
              Очистить
            </button>
            <button type="button" className="btn-ghost" onClick={() => void writerRef.current?.animateCharacter?.()}>
              Показать порядок черт
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
            <div className="rounded-[24px] border border-white/10 bg-black/10 p-4">
              <p className="subtle-text text-xs uppercase tracking-[0.16em]">Текущий знак</p>
              <p className="mt-3 display-hanzi text-5xl font-semibold">{currentCharacter}</p>
              <p className="mt-4 text-sm muted-text">
                Режим: <strong>{mode === "trace" ? "обвести" : "написать самому"}</strong>
              </p>
              <p className="mt-2 text-sm muted-text">
                Ошибок в этой попытке: <strong>{mistakes}</strong>
              </p>
              <p className="mt-2 text-sm muted-text">
                Завершено:{" "}
                <strong>
                  {completed.filter(Boolean).length}/{characters.length}
                </strong>
              </p>
              {allCompleted ? (
                <p className="mt-3 text-sm text-[rgb(var(--success))]">Все знаки слова уже прописаны.</p>
              ) : null}
            </div>

            <div className="rounded-[28px] border border-white/10 bg-[rgba(var(--foreground),0.03)] p-4">
              <div className="flex min-h-[18rem] items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-black/10">
                <div ref={containerRef} className="h-[260px] w-[260px]" />
              </div>
              {isLoading ? <p className="mt-3 text-sm muted-text">Загружаю пропись…</p> : null}
              {error ? <p className="mt-3 text-sm text-[rgb(var(--accent))]">{error}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
