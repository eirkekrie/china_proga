"use client";

import { CardsTable } from "@/components/cards-table";

export default function CardsPage() {
  return (
    <div className="grid gap-6">
      <section className="glass-panel p-6 sm:p-7">
        <span className="pill w-fit">Все карточки</span>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">Поиск, фильтры и диагностика памяти</h1>
        <p className="mt-3 max-w-3xl text-sm muted-text">
          Здесь видно, на каком этапе находится каждая карточка, насколько она забыта, сколько ошибок по ней было и
          когда приложение попросит повторение.
        </p>
      </section>
      <CardsTable />
    </div>
  );
}
