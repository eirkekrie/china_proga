"use client";

import { LessonPicker } from "@/components/lesson-picker";
import { TestSession } from "@/components/test-session";

export default function TestPage() {
  return <div className="grid gap-6"><LessonPicker /><TestSession /></div>;
}
