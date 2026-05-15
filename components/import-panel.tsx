"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { useStudy } from "@/context/study-context";
import { parseCardLines } from "@/lib/parser";

export function ImportPanel() {
  const { cards, importCards } = useStudy();
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const preview = useMemo(() => (draft.trim() ? parseCardLines(draft, cards) : null), [cards, draft]);
  const lessonPreview = useMemo(() => {
    if (!preview) {
      return [];
    }

    const lessons = new Map<string, { title: string; count: number }>();
    preview.cards.forEach((card) => {
      const lesson = lessons.get(card.lessonId);
      if (lesson) {
        lesson.count += 1;
        return;
      }

      lessons.set(card.lessonId, {
        title: card.lessonTitle,
        count: 1,
      });
    });

    return [...lessons.values()].sort((left, right) =>
      left.title.localeCompare(right.title, "ru", { numeric: true, sensitivity: "base" }),
    );
  }, [preview]);

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
      setMessage("Вставьте строки формата urok 3 и 人;rén<br>Человек или загрузите текстовый файл.");
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
            Поддерживается формат строк вида <code>urok 3</code> и <code>人;rén&lt;br&gt;Человек</code>. Пустые строки
            удаляются, дубликаты внутри одного урока игнорируются, новые карточки стартуют с этапа{" "}
            <code>hanzi_to_translation</code>.
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
            {preview ? (
              <div className="rounded-[24px] border border-[rgba(var(--border),0.42)] bg-[rgba(var(--panel),0.34)] p-4 text-sm">
                <p className="font-semibold">Предпросмотр импорта</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-[16px] bg-[rgba(var(--panel),0.44)] p-3">
                    <p className="subtle-text text-xs uppercase tracking-[0.12em]">Новых</p>
                    <p className="mt-1 text-xl font-semibold">{preview.importedCount}</p>
                  </div>
                  <div className="rounded-[16px] bg-[rgba(var(--panel),0.44)] p-3">
                    <p className="subtle-text text-xs uppercase tracking-[0.12em]">Дублей</p>
                    <p className="mt-1 text-xl font-semibold">{preview.duplicates.length}</p>
                  </div>
                  <div className="rounded-[16px] bg-[rgba(var(--panel),0.44)] p-3">
                    <p className="subtle-text text-xs uppercase tracking-[0.12em]">Ошибок</p>
                    <p className="mt-1 text-xl font-semibold">{preview.invalidLines.length}</p>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {lessonPreview.length > 0 ? (
                    lessonPreview.map((lesson) => (
                      <div
                        key={lesson.title}
                        className="flex items-center justify-between rounded-[16px] border border-[rgba(var(--border),0.32)] px-3 py-2"
                      >
                        <span>{lesson.title}</span>
                        <strong>{lesson.count}</strong>
                      </div>
                    ))
                  ) : (
                    <p className="muted-text">Уроки пока не найдены.</p>
                  )}
                </div>
              </div>
            ) : null}
            <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm muted-text">
              <p>Что произойдёт при импорте:</p>
              <ul className="mt-3 space-y-2">
                <li>Заголовки <code>urok 3</code>, <code>urok 10</code> раскладывают карточки по урокам.</li>
                <li>Парсинг строк по разделителям <code>;</code> и <code>&lt;br&gt;</code>.</li>
                <li>Фильтрация пустых и некорректных записей.</li>
                <li>Проверка дубликатов по уроку и связке <code>hanzi + pinyin + translation</code>.</li>
                <li>Сохранение в <code>localStorage</code> и SQLite.</li>
              </ul>
            </div>
            {message ? <p className="text-sm text-[rgb(var(--accent))]">{message}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
