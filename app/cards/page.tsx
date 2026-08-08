"use client";

import { CardsTable } from "@/components/cards-table";
import { ImportPanel } from "@/components/import-panel";
import { LessonPicker } from "@/components/lesson-picker";

export default function CardsPage() {
  return (
    <div className="grid gap-6">
      <header className="page-heading">
        <div>
          <span className="page-eyebrow">Библиотека</span>
          <h1>Мои карточки</h1>
          <p>Ищи слова, исправляй содержимое и управляй учебными наборами.</p>
        </div>
        <LessonPicker compact />
      </header>
      <CardsTable />
      <details className="tool-disclosure">
        <summary>Импортировать карточки</summary>
        <div className="mt-4">
          <ImportPanel />
        </div>
      </details>
    </div>
  );
}
