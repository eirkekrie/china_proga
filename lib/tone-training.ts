import type { Card, ToneExercise, ToneFamilyEntry, ToneNumber, ToneTrainingOption } from "@/lib/types";
import { shuffleArray } from "@/lib/utils";

const ACCENTED_VOWELS: Record<string, { base: string; tone: ToneNumber }> = {
  ā: { base: "a", tone: 1 },
  á: { base: "a", tone: 2 },
  ǎ: { base: "a", tone: 3 },
  à: { base: "a", tone: 4 },
  ē: { base: "e", tone: 1 },
  é: { base: "e", tone: 2 },
  ě: { base: "e", tone: 3 },
  è: { base: "e", tone: 4 },
  ī: { base: "i", tone: 1 },
  í: { base: "i", tone: 2 },
  ǐ: { base: "i", tone: 3 },
  ì: { base: "i", tone: 4 },
  ō: { base: "o", tone: 1 },
  ó: { base: "o", tone: 2 },
  ǒ: { base: "o", tone: 3 },
  ò: { base: "o", tone: 4 },
  ū: { base: "u", tone: 1 },
  ú: { base: "u", tone: 2 },
  ǔ: { base: "u", tone: 3 },
  ù: { base: "u", tone: 4 },
  ǖ: { base: "ü", tone: 1 },
  ǘ: { base: "ü", tone: 2 },
  ǚ: { base: "ü", tone: 3 },
  ǜ: { base: "ü", tone: 4 },
};

const TONE_MARKS: Record<string, [string, string, string, string]> = {
  a: ["ā", "á", "ǎ", "à"],
  e: ["ē", "é", "ě", "è"],
  i: ["ī", "í", "ǐ", "ì"],
  o: ["ō", "ó", "ǒ", "ò"],
  u: ["ū", "ú", "ǔ", "ù"],
  ü: ["ǖ", "ǘ", "ǚ", "ǜ"],
};

const VOWELS = new Set(["a", "e", "i", "o", "u", "ü"]);

function parseSingleSyllable(card: Card) {
  if (Array.from(card.hanzi.trim()).length !== 1) {
    return null;
  }

  const raw = card.pinyin.trim().toLowerCase().replace(/u:/g, "ü").replace(/v/g, "ü");
  if (!raw || /\s/.test(raw)) {
    return null;
  }

  let baseSyllable = "";
  let tone: ToneNumber = 0;

  for (const character of raw) {
    if (ACCENTED_VOWELS[character]) {
      baseSyllable += ACCENTED_VOWELS[character].base;
      tone = ACCENTED_VOWELS[character].tone;
      continue;
    }

    if (character >= "1" && character <= "5") {
      tone = character === "5" ? 0 : (Number(character) as ToneNumber);
      continue;
    }

    if ((character >= "a" && character <= "z") || character === "ü") {
      baseSyllable += character;
    }
  }

  if (!baseSyllable || tone < 1 || tone > 4) {
    return null;
  }

  return {
    baseSyllable,
    tone: tone as Exclude<ToneNumber, 0>,
  };
}

function applyToneToSyllable(baseSyllable: string, tone: Exclude<ToneNumber, 0>) {
  const letters = [...baseSyllable];
  const lowered = letters.join("").toLowerCase();

  let targetIndex = lowered.indexOf("a");
  if (targetIndex < 0) {
    targetIndex = lowered.indexOf("e");
  }
  if (targetIndex < 0 && lowered.includes("ou")) {
    targetIndex = lowered.indexOf("o");
  }
  if (targetIndex < 0) {
    for (let index = letters.length - 1; index >= 0; index -= 1) {
      if (VOWELS.has(lowered[index])) {
        targetIndex = index;
        break;
      }
    }
  }

  if (targetIndex < 0) {
    return `${baseSyllable}${tone}`;
  }

  const vowel = lowered[targetIndex];
  const toneRow = TONE_MARKS[vowel];
  if (!toneRow) {
    return `${baseSyllable}${tone}`;
  }

  letters[targetIndex] = toneRow[tone - 1];
  return letters.join("");
}

function buildToneFamily(baseSyllable: string): ToneFamilyEntry[] {
  return ([1, 2, 3, 4] as const).map((tone) => ({
    tone,
    marked: applyToneToSyllable(baseSyllable, tone),
    numbered: `${baseSyllable}${tone}`,
  }));
}

function buildToneNumberOptions(family: ToneFamilyEntry[]): ToneTrainingOption[] {
  return shuffleArray(
    family.map((entry) => ({
      id: `tone-${entry.tone}`,
      label: `${entry.tone}-й тон`,
      value: String(entry.tone),
      helper: `${entry.marked} · ${entry.numbered}`,
    })),
  );
}

function buildSimilarSyllableOptions(family: ToneFamilyEntry[]): ToneTrainingOption[] {
  return shuffleArray(
    family.map((entry) => ({
      id: `syllable-${entry.tone}`,
      label: entry.marked,
      value: entry.numbered,
      helper: entry.numbered,
    })),
  );
}

export function buildToneExercises(cards: Card[]) {
  const exercises: ToneExercise[] = [];

  cards.forEach((card) => {
    const syllable = parseSingleSyllable(card);
    if (!syllable) {
      return;
    }

    const family = buildToneFamily(syllable.baseSyllable);
    const markedSyllable = applyToneToSyllable(syllable.baseSyllable, syllable.tone);
    const numberedSyllable = `${syllable.baseSyllable}${syllable.tone}`;

    exercises.push({
      id: `${card.id}:tone_number`,
      mode: "tone_number",
      cardId: card.id,
      hanzi: card.hanzi,
      translation: card.translation,
      pinyin: card.pinyin,
      baseSyllable: syllable.baseSyllable,
      markedSyllable,
      numberedSyllable,
      tone: syllable.tone,
      family,
      options: buildToneNumberOptions(family),
    });

    exercises.push({
      id: `${card.id}:similar_syllable`,
      mode: "similar_syllable",
      cardId: card.id,
      hanzi: card.hanzi,
      translation: card.translation,
      pinyin: card.pinyin,
      baseSyllable: syllable.baseSyllable,
      markedSyllable,
      numberedSyllable,
      tone: syllable.tone,
      family,
      options: buildSimilarSyllableOptions(family),
    });
  });

  return shuffleArray(exercises);
}
