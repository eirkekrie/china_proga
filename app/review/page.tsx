"use client";

import { StudySession } from "@/components/study-session";

export default function ReviewPage() {
  return (
    <StudySession
      flow="review"
      title="Повторить изученное"
      description="Здесь только те карточки, которым сейчас полезнее всего вернуться в память."
    />
  );
}
