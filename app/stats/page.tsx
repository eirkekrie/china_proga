"use client";

import { StatsPanels } from "@/components/stats-panels";

export default function StatsPage() {
  return (
    <div className="grid gap-6">
      <header className="page-heading">
        <div>
          <span className="page-eyebrow">Прогресс</span>
          <h1>Как идут занятия</h1>
          <p>Время, регулярность и результаты без лишнего шума.</p>
        </div>
      </header>
      <StatsPanels />
    </div>
  );
}
