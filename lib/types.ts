export const learningStages = [
  "hanzi_to_translation",
  "translation_to_hanzi",
  "hanzi_to_pinyin",
] as const;

export type LearningStage = (typeof learningStages)[number];
export type CardStatus = "new" | "learning" | "review" | "mastered";
export type ReviewGrade = "again" | "hard" | "good";
export type StudyFlow = "learn" | "review" | "test";
export type ThemeMode = "light" | "dark";

export type StageProgress = {
  hanzi_to_translation: number;
  translation_to_hanzi: number;
  hanzi_to_pinyin: number;
};

export type FsrsStateLabel = "New" | "Learning" | "Review" | "Relearning";

export type FsrsCardSnapshot = {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: FsrsStateLabel;
  last_review: string | null;
};

export type Card = {
  id: string;
  hanzi: string;
  pinyin: string;
  translation: string;
  status: CardStatus;
  currentStage: LearningStage;
  stageProgress: StageProgress;
  repetitions: number;
  mistakes: number;
  streakCorrect: number;
  easeFactor: number;
  interval: number;
  memoryStrength: number;
  forgettingScore: number;
  createdAt: string;
  lastSeenAt: string | null;
  lastCorrectAt: string | null;
  nextReviewAt: string | null;
  fsrs: FsrsCardSnapshot;
  totalTimeSpent: number;
  averageResponseTime: number;
};

export type StudyStats = {
  totalStudyTime: number;
  todayStudyTime: number;
  sessionStudyTime: number;
  totalReviews: number;
  totalCorrect: number;
  totalWrong: number;
  streakDays: number;
  lastStudyDate: string | null;
  dailyStudyLog: Record<string, number>;
};

export type ParseResult = {
  cards: Card[];
  duplicates: string[];
  invalidLines: string[];
  importedCount: number;
};

export type DerivedCard = Card & {
  effectiveMemoryStrength: number;
  effectiveForgettingScore: number;
  daysSinceSeen: number;
  isDue: boolean;
  overdueLevel: "fresh" | "soon" | "due" | "critical";
  computedStatus: CardStatus;
  overallProgressPercent: number;
  stageIndex: number;
};

export type DashboardMetrics = {
  totalCards: number;
  newCount: number;
  learningCount: number;
  reviewCount: number;
  masteredCount: number;
  dueTodayCount: number;
  progressPercent: number;
  stageBreakdown: Record<LearningStage, number>;
};

export type TestOption = {
  id: string;
  label: string;
  value: string;
};

export type AudioManifestEntry = {
  path: string;
  hanzi: string;
  pinyin: string;
  translation: string;
  text: string;
  generatedAt: string;
  engine: string;
  modelId: string;
  mode: string;
  speaker: string;
};

export type AudioManifest = {
  version: number;
  generatedAt: string;
  engine: string;
  modelId: string;
  mode: string;
  speaker: string;
  sourceFile?: string;
  entries: Record<string, AudioManifestEntry>;
  stats?: {
    inputCards: number;
    generated: number;
    reused: number;
    duplicates: number;
    invalidLines: number;
  };
};

export type ToneTrainingMode = "tone_number" | "similar_syllable";
export type ToneNumber = 0 | 1 | 2 | 3 | 4;

export type ToneTrainingOption = {
  id: string;
  label: string;
  value: string;
  helper?: string;
};

export type ToneFamilyEntry = {
  tone: Exclude<ToneNumber, 0>;
  marked: string;
  numbered: string;
};

export type ToneExercise = {
  id: string;
  mode: ToneTrainingMode;
  cardId: string;
  hanzi: string;
  translation: string;
  pinyin: string;
  baseSyllable: string;
  markedSyllable: string;
  numberedSyllable: string;
  tone: Exclude<ToneNumber, 0>;
  options: ToneTrainingOption[];
  family: ToneFamilyEntry[];
};
