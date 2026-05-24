"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Sparkles } from "lucide-react";
import { extractHanziCharacters } from "@/lib/utils";
import type { HandwritingAnswerState } from "@/components/hanzi-handwriting-answer";
import { recognizeHanziStrokes, type HanziRecognitionCandidate } from "@/lib/hanzi-lookup-recognizer";

type Point = {
  x: number;
  y: number;
};

type SimilarityResult = {
  score: number;
  shapeScore: number;
  passed: boolean;
  method: "recognition" | "none";
  candidates: HanziRecognitionCandidate[];
};

type HanziSimilarityAnswerProps = {
  hanzi: string;
  onChange?: (state: HandwritingAnswerState & { similarityScore: number; checked: boolean }) => void;
  threshold?: number;
};

const CANVAS_SIZE = 360;
const COMPARE_SIZE = 192;
const DRAWING_WIDTH = 14;
const SHAPE_RADIUS = 12;
const MULTI_CHARACTER_THRESHOLD = 82;

function getPoint(event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * CANVAS_SIZE,
    y: ((event.clientY - rect.top) / rect.height) * CANVAS_SIZE,
  };
}

function drawStroke(ctx: CanvasRenderingContext2D, points: Point[], color: string, width = DRAWING_WIDTH) {
  if (points.length === 0) {
    return;
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = width;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    ctx.quadraticCurveTo(previous.x, previous.y, (previous.x + current.x) / 2, (previous.y + current.y) / 2);
  }
  ctx.stroke();
}

function setupCanvas(canvas: HTMLCanvasElement) {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = CANVAS_SIZE * ratio;
  canvas.height = CANVAS_SIZE * ratio;
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}

function flatten(strokes: Point[][]) {
  return strokes.flat();
}

function getBounds(points: Point[]) {
  if (points.length === 0) {
    return null;
  }

  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: 0, maxY: 0 },
  );
}

function rasterizeDrawing(strokes: Point[][]) {
  const canvas = document.createElement("canvas");
  canvas.width = COMPARE_SIZE;
  canvas.height = COMPARE_SIZE;
  const ctx = canvas.getContext("2d");
  const points = flatten(strokes);
  const bounds = getBounds(points);

  if (!ctx || !bounds) {
    return null;
  }

  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min((COMPARE_SIZE * 0.72) / width, (COMPARE_SIZE * 0.72) / height);
  const offsetX = (COMPARE_SIZE - width * scale) / 2 - bounds.minX * scale;
  const offsetY = (COMPARE_SIZE - height * scale) / 2 - bounds.minY * scale;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "white";
  ctx.lineWidth = Math.max(5, DRAWING_WIDTH * scale);

  strokes.forEach((stroke) => {
    if (stroke.length === 0) {
      return;
    }

    ctx.beginPath();
    ctx.moveTo(stroke[0].x * scale + offsetX, stroke[0].y * scale + offsetY);
    for (let index = 1; index < stroke.length; index += 1) {
      const previous = stroke[index - 1];
      const current = stroke[index];
      ctx.quadraticCurveTo(
        previous.x * scale + offsetX,
        previous.y * scale + offsetY,
        ((previous.x + current.x) / 2) * scale + offsetX,
        ((previous.y + current.y) / 2) * scale + offsetY,
      );
    }
    ctx.stroke();
  });

  return ctx.getImageData(0, 0, COMPARE_SIZE, COMPARE_SIZE).data;
}

function rasterizeReference(hanzi: string) {
  const canvas = document.createElement("canvas");
  canvas.width = COMPARE_SIZE;
  canvas.height = COMPARE_SIZE;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return null;
  }

  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const characters = Array.from(hanzi);
  if (characters.length <= 1) {
    ctx.font = `700 ${Math.round(COMPARE_SIZE * 0.7)}px "Noto Serif SC", "Songti SC", "STSong", serif`;
    ctx.fillText(hanzi, COMPARE_SIZE / 2, COMPARE_SIZE / 2 + COMPARE_SIZE * 0.04, COMPARE_SIZE * 0.82);
  } else {
    const slotWidth = COMPARE_SIZE / characters.length;
    const fontSize = Math.min(COMPARE_SIZE * 0.66, slotWidth * 0.92);
    ctx.font = `700 ${Math.round(fontSize)}px "Noto Serif SC", "Songti SC", "STSong", serif`;

    characters.forEach((character, index) => {
      ctx.fillText(character, slotWidth * index + slotWidth / 2, COMPARE_SIZE / 2 + COMPARE_SIZE * 0.04, slotWidth * 0.92);
    });
  }

  return ctx.getImageData(0, 0, COMPARE_SIZE, COMPARE_SIZE).data;
}

function scoreMasks(userMask: Uint8ClampedArray, referenceMask: Uint8ClampedArray): number {
  const userPoints = maskToPoints(userMask);
  const referencePoints = maskToPoints(referenceMask);

  if (userPoints.length === 0 || referencePoints.length === 0) {
    return 0;
  }

  const userCoverage = coverageScore(userPoints, referencePoints, SHAPE_RADIUS);
  const referenceCoverage = coverageScore(referencePoints, userPoints, SHAPE_RADIUS);

  return Math.round((userCoverage * 0.45 + referenceCoverage * 0.55) * 100);
}

function scoreCharacterSlots(userMask: Uint8ClampedArray, referenceMask: Uint8ClampedArray, characterCount: number): number {
  if (characterCount <= 1) {
    return scoreMasks(userMask, referenceMask);
  }

  const slotScores = Array.from({ length: characterCount }, (_, index) => {
    const minX = Math.floor((COMPARE_SIZE / characterCount) * index);
    const maxX = Math.floor((COMPARE_SIZE / characterCount) * (index + 1));
    const userPoints = maskToPointsInRange(userMask, minX, maxX);
    const referencePoints = maskToPointsInRange(referenceMask, minX, maxX);

    if (userPoints.length < 8 || referencePoints.length === 0) {
      return 0;
    }

    const userCoverage = coverageScore(userPoints, referencePoints, SHAPE_RADIUS);
    const referenceCoverage = coverageScore(referencePoints, userPoints, SHAPE_RADIUS);
    return Math.round((userCoverage * 0.38 + referenceCoverage * 0.62) * 100);
  });

  const minimumSlot = Math.min(...slotScores);
  const averageSlot = slotScores.reduce((sum, score) => sum + score, 0) / slotScores.length;
  return Math.round(minimumSlot * 0.55 + averageSlot * 0.45);
}

function maskToPoints(mask: Uint8ClampedArray): Point[] {
  return maskToPointsInRange(mask, 0, COMPARE_SIZE);
}

function maskToPointsInRange(mask: Uint8ClampedArray, minX: number, maxX: number): Point[] {
  const points: Point[] = [];

  for (let y = 0; y < COMPARE_SIZE; y += 2) {
    for (let x = minX; x < maxX; x += 2) {
      const alphaIndex = (y * COMPARE_SIZE + x) * 4 + 3;
      if (mask[alphaIndex] > 30) {
        points.push({ x, y });
      }
    }
  }

  return points;
}

function coverageScore(source: Point[], target: Point[], radius: number) {
  const radiusSquared = radius * radius;
  let covered = 0;

  for (const sourcePoint of source) {
    for (const targetPoint of target) {
      const dx = sourcePoint.x - targetPoint.x;
      const dy = sourcePoint.y - targetPoint.y;
      if (dx * dx + dy * dy <= radiusSquared) {
        covered += 1;
        break;
      }
    }
  }

  return covered / source.length;
}

function compareDrawing(strokes: Point[][], hanzi: string, threshold: number): SimilarityResult {
  const userMask = rasterizeDrawing(strokes);
  const referenceMask = rasterizeReference(hanzi);
  const characterCount = Array.from(hanzi).length;
  const effectiveThreshold = characterCount > 1 ? Math.max(threshold, MULTI_CHARACTER_THRESHOLD) : threshold;

  if (!userMask || !referenceMask) {
    return { score: 0, shapeScore: 0, passed: false, method: "none", candidates: [] };
  }

  const score = scoreCharacterSlots(userMask, referenceMask, characterCount);
  return {
    score,
    shapeScore: score,
    passed: score >= effectiveThreshold,
    method: "none",
    candidates: [],
  };
}

export function HanziSimilarityAnswer({ hanzi, onChange, threshold = 56 }: HanziSimilarityAnswerProps) {
  const characters = useMemo(() => extractHanziCharacters(hanzi), [hanzi]);
  const target = characters.join("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Point[][]>([]);
  const activeStrokeRef = useRef<Point[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [result, setResult] = useState<SimilarityResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = setupCanvas(canvas);
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    strokesRef.current.forEach((stroke) => drawStroke(ctx, stroke, "#38bdf8"));
    drawStroke(ctx, activeStrokeRef.current, "#38bdf8");
  }

  useEffect(() => {
    strokesRef.current = [];
    activeStrokeRef.current = [];
    setStrokeCount(0);
    setAttempts(0);
    setResult(null);
    requestAnimationFrame(redraw);
  }, [target]);

  useEffect(() => {
    onChange?.({
      isReady: Boolean(result?.passed),
      answer: target,
      totalCharacters: characters.length,
      completedCharacters: result?.passed ? characters.length : 0,
      totalMistakes: attempts,
      similarityScore: result?.score ?? 0,
      checked: Boolean(result),
    });
  }, [attempts, characters.length, onChange, result, target]);

  if (!target) {
    return null;
  }

  function reset() {
    strokesRef.current = [];
    activeStrokeRef.current = [];
    setStrokeCount(0);
    setAttempts(0);
    setResult(null);
    redraw();
  }

  function undo() {
    strokesRef.current = strokesRef.current.slice(0, -1);
    setStrokeCount(strokesRef.current.length);
    setResult(null);
    redraw();
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    canvas.setPointerCapture(event.pointerId);
    activeStrokeRef.current = [getPoint(event, canvas)];
    setIsDrawing(true);
    setResult(null);
    redraw();
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !isDrawing) {
      return;
    }

    activeStrokeRef.current = [...activeStrokeRef.current, getPoint(event, canvas)];
    redraw();
  }

  function handlePointerUp() {
    if (!isDrawing) {
      return;
    }

    if (activeStrokeRef.current.length > 1) {
      strokesRef.current = [...strokesRef.current, activeStrokeRef.current];
    }

    activeStrokeRef.current = [];
    setIsDrawing(false);
    setStrokeCount(strokesRef.current.length);
    redraw();
  }

  async function handleCheck() {
    setIsChecking(true);

    try {
      const shapeResult = compareDrawing(strokesRef.current, target, threshold);

      if (characters.length === 1) {
        const candidates = await recognizeHanziStrokes(strokesRef.current, 8);
        if (candidates.length > 0) {
          const top5 = candidates.slice(0, 5);
          const targetIndex = top5.findIndex((candidate) => candidate.character === target);
          const recognitionPassed = targetIndex >= 0;
          const next: SimilarityResult = {
            score: recognitionPassed
              ? targetIndex === 0
                ? 100
                : targetIndex === 1
                  ? 85
                  : targetIndex === 2
                    ? 75
                    : targetIndex === 3
                      ? 65
                      : 55
              : 0,
            shapeScore: shapeResult.score,
            passed: recognitionPassed,
            method: recognitionPassed ? "recognition" : "none",
            candidates,
          };
          setResult(next);
          setAttempts((value) => (next.passed ? value : value + 1));
          return;
        }
      }

      const next: SimilarityResult = {
        ...shapeResult,
        score: 0,
        passed: false,
        method: "none",
      };
      setResult(next);
      setAttempts((value) => value + 1);
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <div className="grid gap-4 rounded-[28px] border border-white/10 bg-white/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Рукописный ответ</p>
          <p className="mt-1 text-sm muted-text">
            Нарисуйте весь иероглиф целиком. Распознаватель вернёт top-кандидатов и сравнит их с правильным знаком.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={undo} disabled={strokeCount === 0}>
            Назад
          </button>
          <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={reset}>
            <RotateCcw size={14} />
            Начать заново
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <div className="rounded-[24px] border border-white/10 bg-black/10 p-4">
          <p className="subtle-text text-xs uppercase tracking-[0.16em]">Проверка</p>
          <p className="mt-3 text-3xl font-semibold">{result ? `${result.score}%` : "—"}</p>
          <p className="mt-3 text-sm muted-text">
            {characters.length === 1 ? "Правильный знак должен быть в top-5" : "Для слов нужен режим выбора"}
          </p>
          <div className="mt-3 rounded-[16px] border border-white/10 bg-black/10 p-3">
            <p className="subtle-text text-xs uppercase tracking-[0.16em]">Правильный знак</p>
            <p className="display-hanzi mt-2 text-4xl font-semibold">{target}</p>
          </div>
          <p className="mt-2 text-sm muted-text">Линий нарисовано: {strokeCount}</p>
          <p className="mt-2 text-sm muted-text">Неудачных попыток: {attempts}</p>
          {result ? (
            <p className={["mt-3 text-sm", result.passed ? "text-[rgb(var(--success))]" : "text-[rgb(var(--danger))]"].join(" ")}>
              {result.passed
                ? "Распознаватель нашёл нужный знак в top-5."
                : "Нужного знака нет в top-5 распознавания."}
            </p>
          ) : null}
          {result ? <p className="mt-2 text-sm muted-text">Сходство формы: {result.shapeScore}% не влияет на зачёт.</p> : null}
          {result?.candidates.length ? (
            <div className="mt-4 grid gap-2">
              <p className="subtle-text text-xs uppercase tracking-[0.16em]">Top кандидаты</p>
              {!result.candidates.slice(0, 5).some((candidate) => candidate.character === target) ? (
                <p className="text-xs muted-text">
                  Распознаватель не поставил нужный знак в top-5. Ответ не будет засчитан.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {result.candidates.slice(0, 5).map((candidate, index) => (
                  <span
                    key={`${candidate.character}-${index}`}
                    className={[
                      "display-hanzi rounded-xl border px-3 py-2 text-2xl font-semibold",
                      candidate.character === target
                        ? "border-[rgba(var(--success),0.45)] bg-[rgba(var(--success),0.12)] text-[rgb(var(--success))]"
                        : "border-white/10 bg-black/10",
                    ].join(" ")}
                    title={`score: ${Math.round(candidate.score)}`}
                  >
                    {candidate.character}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-[28px] border border-white/10 bg-[rgba(var(--foreground),0.03)] p-4">
          <div className="relative aspect-square min-h-[18rem] overflow-hidden rounded-[24px] border border-dashed border-white/10 bg-black/20">
            <div className="pointer-events-none absolute inset-0 soft-grid opacity-30" />
            <canvas
              ref={canvasRef}
              className="relative z-10 h-full w-full touch-none"
              aria-label="Поле для рукописного ответа"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onLostPointerCapture={handlePointerUp}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button type="button" className="btn-primary" onClick={() => void handleCheck()} disabled={strokeCount === 0 || isChecking}>
              <Sparkles size={15} />
              {isChecking ? "Распознаю..." : "Распознать иероглиф"}
            </button>
            <p className="text-sm muted-text">
              {characters.length === 1
                ? "Засчитывается только попадание правильного знака в top-5."
                : "Для слов из нескольких знаков рукописный зачёт отключён: используйте режим выбора."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
