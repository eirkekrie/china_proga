"use client";

import { StatsPanels } from "@/components/stats-panels";

export default function StatsPage() {
  return (
    <div className="grid gap-6">
      <section className="glass-panel p-6 sm:p-7">
        <span className="pill w-fit">Статистика</span>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">Время, серия дней и сложные карточки</h1>
        <p className="mt-3 max-w-3xl text-sm muted-text">
          Страница показывает, сколько времени ушло на обучение в целом, сегодня и за неделю, а также выделяет карточки,
          которые быстрее всего выпадают из памяти.
        </p>
      </section>
      <StatsPanels />
    </div>
  );
}
