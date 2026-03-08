"use client";

import { StudySession } from "@/components/study-session";

export default function LearnPage() {
  return (
    <StudySession
      flow="learn"
      title="Обучение по этапам"
      description="Новые карточки идут только после тех, что уже требуют внимания. Сначала закрепляется смысл, затем обратное воспроизведение, пиньинь и произношение."
    />
  );
}
