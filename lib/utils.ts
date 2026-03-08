import type { Card, LearningStage } from "@/lib/types";

const DAY_MS = 1000 * 60 * 60 * 24;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function diffInDays(from: Date, to: Date) {
  return Math.max(0, (to.getTime() - from.getTime()) / DAY_MS);
}

export function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}ч ${String(minutes).padStart(2, "0")}м`;
  }

  if (minutes > 0) {
    return `${minutes}м ${String(seconds).padStart(2, "0")}с`;
  }

  return `${seconds}с`;
}

export function formatMinutes(ms: number) {
  return Math.round(ms / 60000);
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return "Не назначено";
  }

  const date = new Date(value);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatRelativeDue(value: string | null) {
  if (!value) {
    return "Сейчас";
  }

  const target = new Date(value);
  const diffMs = target.getTime() - Date.now();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));

  if (Math.abs(diffHours) < 1) {
    return "Сейчас";
  }

  if (diffHours > 0) {
    if (diffHours < 24) {
      return `через ${diffHours} ч`;
    }
    return `через ${Math.round(diffHours / 24)} д.`;
  }

  if (Math.abs(diffHours) < 24) {
    return `${Math.abs(diffHours)} ч назад`;
  }

  return `${Math.round(Math.abs(diffHours) / 24)} д. назад`;
}

export function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,!?;:()[\]{}"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePinyin(value: string) {
  return normalizeText(value).replace(/u:/g, "u").replace(/v/g, "u");
}

export function extractHanziCharacters(value: string) {
  return [...value].filter((char) => /\p{Script=Han}/u.test(char));
}

export function buildCardKey(card: Pick<Card, "hanzi" | "pinyin" | "translation">) {
  return `${normalizeText(card.hanzi)}|${normalizePinyin(card.pinyin)}|${normalizeText(card.translation)}`;
}

export function compareAnswer(mode: LearningStage, answer: string, card: Card) {
  if (mode === "translation_to_hanzi") {
    return answer.trim() === card.hanzi.trim();
  }

  if (mode === "hanzi_to_pinyin" || mode === "hanzi_to_pronunciation") {
    return normalizePinyin(answer) === normalizePinyin(card.pinyin);
  }

  const normalizedAnswer = normalizeText(answer);
  const normalizedTarget = normalizeText(card.translation);
  return normalizedAnswer === normalizedTarget || normalizedAnswer.includes(normalizedTarget);
}

export function shuffleArray<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}
