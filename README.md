# Hanzi Flow

Учебное приложение для изучения китайских иероглифов на `Next.js + TypeScript + Tailwind CSS`.

## Запуск

```bash
npm install
npm run dev
```

После запуска откройте `http://localhost:3000`.

Теперь `npm run dev` запускает сразу:

- Next.js приложение
- локальный `pronunciation server`

Если нужен только веб-интерфейс без сервера распознавания, используйте:

```bash
npm run dev:web
```

Если `python` в системе называется иначе, можно указать интерпретатор явно:

```bash
PYTHON_EXECUTABLE=python npm run dev
```

## SQLite

Приложение хранит состояние в SQLite через route `app/api/state/route.ts`.

- файл базы по умолчанию: `data/hanzi-flow.db`
- хранятся карточки, статистика и тема
- `localStorage` оставлен как локальный кэш и fallback

Путь к файлу можно переопределить через `DATABASE_PATH`.

## Озвучка карточек

Приложение использует только предзаписанные `wav`-файлы.

Используемые файлы:

- `public/audio/cards/*.wav`
- `public/audio/cards/manifest.json`

Манифест связывает карточку с аудио по стабильному ключу из `hanzi + pinyin + translation`.

Если для карточки нет готового `wav`, приложение покажет сообщение, что аудио не найдено. Live TTS и браузерный синтез речи больше не используются.

## Генерация wav-файлов

Для генерации предзаписанного аудио оставлен Python-скрипт:

```bash
python scripts/generate_card_audio.py --input path/to/cards.txt
```

или через npm:

```bash
npm run generate:audio -- --input path/to/cards.txt
```

Перед этим установите зависимости:

```bash
pip install -r requirements-qwen-tts.txt
```

Файл на входе должен быть формата:

```text
人;rén<br>Человек
你;nǐ<br>Ты, вы
```

Полезные опции:

- `--force` — пересоздать аудио даже если файл уже есть
- `--limit 10` — сгенерировать только первые 10 карточек для проверки
- `--output-dir public/audio/cards` — изменить каталог аудиофайлов
- `--manifest public/audio/cards/manifest.json` — изменить путь манифеста

Основные переменные генератора лежат в `.env.example`:

- `QWEN_TTS_MODEL`
- `QWEN_TTS_LANGUAGE`
- `QWEN_TTS_DEVICE`
- `QWEN_TTS_DTYPE`
- `QWEN_TTS_ATTN_IMPLEMENTATION`
- `QWEN_TTS_SPEAKER`
- `QWEN_TTS_INSTRUCT`
- `QWEN_TTS_REF_AUDIO`
- `QWEN_TTS_REF_TEXT`

## Распознавание произношения

Для проверки произношения приложение записывает голос с микрофона и отправляет его в локальный open-source сервис.

Текущий стек:

- `FunAudioLLM/SenseVoiceSmall` через `FunASR`
- локальный сервер `scripts/pronunciation_server.py`
- Next route `app/api/pronunciation/route.ts`

### Настройка pronunciation server

1. Скопируйте переменные из `.env.example` в `.env.local`
2. Установите зависимости:

```bash
pip install -r requirements-pronunciation.txt
```

3. Обычно отдельно запускать локальный сервис не нужно: его поднимает `npm run dev`.

Если хотите поднять только сервис распознавания отдельно:

```bash
python scripts/pronunciation_server.py
```

или:

```bash
npm run pronunciation:server
```

## Что внутри

- Поэтапное обучение: `иероглиф → перевод → иероглиф → пиньинь → произношение`
- Forgetting curve на основе `memoryStrength`, `forgettingScore`, `lastSeenAt`, `nextReviewAt`
- Статистика времени: общее, за сегодня, за сессию, среднее на карточку
- Пропись на обратной стороне карточки через `hanzi-writer`
- Опциональный рукописный ответ в тесте `перевод → иероглиф`
- Импорт строк вида `人;rén<br>Человек`
- Хранение состояния в SQLite и `localStorage`

## Главные папки

- `app/` — страницы и глобальные стили
- `components/` — интерфейсные блоки
- `context/` — клиентское хранилище приложения
- `lib/` — типы, парсер, forgetting logic и утилиты
