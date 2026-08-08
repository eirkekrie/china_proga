"use client";

import { StudySession } from "@/components/study-session";

export default function LearnPage() {
  return (
    <StudySession
      flow="learn"
      title="Учить новое"
      description="Небольшими порциями: сначала узнай значение, затем попробуй вспомнить иероглиф самостоятельно."
    />
  );
}
