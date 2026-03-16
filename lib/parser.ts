import { createInitialFsrsSnapshot } from "@/lib/fsrs";
import { learningStages, type Card, type ParseResult, type StageProgress } from "@/lib/types";
import { buildCardKey } from "@/lib/utils";

function createEmptyStageProgress(): StageProgress {
  return {
    hanzi_to_translation: 0,
    translation_to_hanzi: 0,
    hanzi_to_pinyin: 0,
  };
}

function createCardId(hanzi: string, pinyin: string, translation: string, index: number) {
  const readable = `${hanzi}-${pinyin}-${translation}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40);

  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : `${Date.now().toString(36)}${index.toString(36)}`;

  return `${readable || "card"}-${suffix}`;
}

function createCard(
  hanzi: string,
  pinyin: string,
  translation: string,
  index: number,
  now: Date,
): Card {
  return {
    id: createCardId(hanzi, pinyin, translation, index),
    hanzi,
    pinyin,
    translation,
    status: "new",
    currentStage: learningStages[0],
    stageProgress: createEmptyStageProgress(),
    repetitions: 0,
    mistakes: 0,
    streakCorrect: 0,
    easeFactor: 2.3,
    interval: 0,
    memoryStrength: 8,
    forgettingScore: 12,
    createdAt: now.toISOString(),
    lastSeenAt: null,
    lastCorrectAt: null,
    nextReviewAt: null,
    fsrs: createInitialFsrsSnapshot(now),
    totalTimeSpent: 0,
    averageResponseTime: 0,
  };
}

export function parseCardLines(rawText: string, existingCards: Card[] = []): ParseResult {
  const now = new Date();
  const lines = rawText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const existingKeys = new Set(existingCards.map((card) => buildCardKey(card)));
  const duplicates: string[] = [];
  const invalidLines: string[] = [];
  const cards: Card[] = [];

  lines.forEach((line, index) => {
    const splitByBreak = line.split(/<br\s*\/?>/i);
    if (splitByBreak.length !== 2) {
      invalidLines.push(line);
      return;
    }

    const [left, translationRaw] = splitByBreak;
    const leftParts = left.split(";");
    if (leftParts.length !== 2) {
      invalidLines.push(line);
      return;
    }

    const hanzi = leftParts[0].trim();
    const pinyin = leftParts[1].trim();
    const translation = translationRaw.trim();

    if (!hanzi || !pinyin || !translation) {
      invalidLines.push(line);
      return;
    }

    const key = buildCardKey({ hanzi, pinyin, translation });
    if (existingKeys.has(key)) {
      duplicates.push(line);
      return;
    }

    existingKeys.add(key);
    cards.push(createCard(hanzi, pinyin, translation, index, now));
  });

  return {
    cards,
    duplicates,
    invalidLines,
    importedCount: cards.length,
  };
}
