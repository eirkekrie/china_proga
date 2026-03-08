"use client";

import { useState, type ChangeEvent } from "react";
import { useStudy } from "@/context/study-context";

export function ImportPanel() {
  const { importCards } = useStudy();
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const text = await file.text();
    setDraft(text);
    setMessage(`Файл ${file.name} загружен в форму. Проверьте содержимое и нажмите импорт.`);
  }

  function handleImport() {
    if (!draft.trim()) {
      setMessage("Вставьте строки формата 人;rén<br>Человек или загрузите текстовый файл.");
      return;
    }

    const result = importCards(draft);

    if (result.importedCount === 0) {
      setMessage(
        `Новых карточек не найдено. Дубликаты: ${result.duplicates.length}, некорректные строки: ${result.invalidLines.length}.`,
      );
      return;
    }

    setMessage(
      `Импортировано ${result.importedCount} карточек. Дубликаты: ${result.duplicates.length}. Некорректные строки: ${result.invalidLines.length}.`,
    );
    setDraft("");
  }

  return (
    <section className="glass-panel p-6 sm:p-7">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="pill w-fit">Импорт</span>
          <h2 className="text-2xl font-semibold tracking-[-0.04em]">Текстовый файл в карточки</h2>
          <p className="max-w-3xl text-sm muted-text">
            Поддерживается формат строк вида <code>人;rén&lt;br&gt;Человек</code>. Пустые строки удаляются, дубликаты
            игнорируются, новые карточки стартуют с этапа <code>hanzi_to_translation</code>.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-56 rounded-[28px] border border-white/10 bg-black/10 p-4 text-sm outline-none transition focus:border-[rgba(var(--accent),0.45)] focus:ring-2 focus:ring-[rgba(var(--accent),0.16)]"
            placeholder={"人;rén<br>Человек\n你;nǐ<br>Ты, вы"}
          />

          <div className="flex flex-col gap-3 rounded-[28px] border border-white/10 bg-black/10 p-4">
            <label className="btn-secondary cursor-pointer text-center">
              Загрузить файл
              <input type="file" accept=".txt" className="hidden" onChange={handleFileChange} />
            </label>
            <button type="button" className="btn-primary" onClick={handleImport}>
              Импортировать карточки
            </button>
            <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm muted-text">
              <p>Что произойдёт при импорте:</p>
              <ul className="mt-3 space-y-2">
                <li>Парсинг строк по разделителям `;` и `&lt;br&gt;`.</li>
                <li>Фильтрация пустых и некорректных записей.</li>
                <li>Проверка дубликатов по `hanzi + pinyin + translation`.</li>
                <li>Сохранение в `localStorage` без backend.</li>
              </ul>
            </div>
            {message ? <p className="text-sm text-[rgb(var(--accent))]">{message}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
