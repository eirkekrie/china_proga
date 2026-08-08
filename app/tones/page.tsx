"use client";

import { LessonPicker } from "@/components/lesson-picker";
import { ToneTrainingSession } from "@/components/tone-training-session";

export default function ToneTrainingPage() {
  return <div className="grid gap-6"><LessonPicker /><ToneTrainingSession /></div>;
}
