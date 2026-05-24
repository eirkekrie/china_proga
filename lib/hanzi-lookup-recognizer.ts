import type { CharacterMatch } from "hanzilookup-js";

export type HanziRecognitionCandidate = {
  character: string;
  score: number;
};

type Point = {
  x: number;
  y: number;
};

let matcherPromise: Promise<import("hanzilookup-js").Matcher | null> | null = null;

function getMatcher() {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  matcherPromise ??= import("hanzilookup-js").then(
    ({ init, Matcher }) =>
      new Promise<import("hanzilookup-js").Matcher | null>((resolve) => {
        init("mmah", "/hanzilookup/mmah.json", (success) => {
          resolve(success ? new Matcher("mmah") : null);
        });
      }),
  );

  return matcherPromise;
}

function toRawStrokes(strokes: Point[][]): number[][][] {
  return strokes
    .filter((stroke) => stroke.length > 1)
    .map((stroke) => stroke.map((point) => [point.x, point.y]));
}

export async function recognizeHanziStrokes(strokes: Point[][], limit = 8): Promise<HanziRecognitionCandidate[]> {
  const matcher = await getMatcher();
  if (!matcher) {
    return [];
  }

  const { AnalyzedCharacter } = await import("hanzilookup-js");
  const analyzed = new AnalyzedCharacter(toRawStrokes(strokes));

  return new Promise((resolve) => {
    matcher.match(analyzed, limit, (matches: CharacterMatch[]) => {
      resolve(matches.map((match) => ({ character: match.character, score: match.score })));
    });
  });
}
