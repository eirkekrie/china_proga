"use client";

import { StudySession } from "@/components/study-session";

export default function ReviewPage() {
  return (
    <StudySession
      flow="review"
      title="Повторение по forgetting score"
      description="Экран собирает карточки, у которых подошёл срок повторения, вырос forgetting score или начала снижаться уверенность знания."
    />
  );
}
