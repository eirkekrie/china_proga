"use client";

import { StatsPanels } from "@/components/stats-panels";

export default function StatsPage() {
  return (
    <div className="grid gap-6">
      <section className="glass-panel p-6 sm:p-7">
        <span className="pill w-fit">Статистика</span>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">Календарь учёбы и ручные сессии</h1>
        <p className="mt-3 max-w-3xl text-sm muted-text">
          Каждый день окрашивается по суммарному времени занятий. Автоматическое время из карточек можно дополнять
          ручными сессиями: чтением, грамматикой, аудированием, письмом или любой другой практикой.
        </p>
      </section>
      <StatsPanels />
    </div>
  );
}
