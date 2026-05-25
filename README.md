# Hanzi Flow

Учебное приложение для изучения китайских иероглифов на `Next.js + TypeScript + Tailwind CSS`.

## Запуск

```bash
npm install
npm run dev
```

После запуска откройте `http://localhost:3000`.

## SQLite

Приложение хранит состояние в SQLite через route `app/api/state/route.ts`.

- файл базы по умолчанию: `data/hanzi-flow.db`
- хранятся карточки, статистика и тема
- `localStorage` оставлен как локальный кэш и fallback

Путь к файлу можно переопределить через `DATABASE_PATH`.

## Уроки и импорт

Импорт поддерживает заголовки уроков вида `urok 3`, `urok 10`. Все карточки после заголовка попадают в этот урок до следующего заголовка:

```text
urok 3
人;rén<br>Человек
你;nǐ<br>Ты, вы

urok 4
叫;jiào<br>Звать
什么;shénme<br>Что, какой
```

Карточки без заголовка остаются в общем наборе и не получают отдельную кнопку урока. Дубликаты проверяются внутри одного урока, поэтому одно и то же слово в разных уроках хранится как отдельные карточки с независимым прогрессом.

## Озвучка карточек

Приложение использует только предзаписанные `wav`-файлы.

Используемые файлы:

- `public/audio/cards/*.wav`
- `public/audio/cards/manifest.json`

Манифест связывает карточку с аудио по стабильному ключу из `hanzi + pinyin + translation`.

Если для карточки нет готового `wav`, приложение покажет сообщение, что аудио не найдено.

## Генерация wav-файлов

Для генерации предзаписанного аудио оставлен Python-скрипт:

```bash
python scripts/generate_card_audio.py --input path/to/cards.txt
```

или через npm:

```bash
npm run generate:audio -- --input path/to/cards.txt
```

По умолчанию используется Qwen TTS. Для CosyVoice 3.0 передайте `--engine cosyvoice`:

```bash
npm run generate:audio -- --engine cosyvoice --input path/to/cards.txt --force
```

Перед Qwen-генерацией установите зависимости:

```bash
pip install -r requirements-qwen-tts.txt
```

Перед CosyVoice-генерацией нужен установленный официальный репозиторий CosyVoice и модель Fun-CosyVoice3. Пример раскладки:

```bash
git clone --recursive https://github.com/FunAudioLLM/CosyVoice.git assets/cosyvoice/CosyVoice
cd assets/cosyvoice/CosyVoice
pip install -r requirements.txt
python -c "from modelscope import snapshot_download; snapshot_download('FunAudioLLM/Fun-CosyVoice3-0.5B-2512', local_dir='pretrained_models/Fun-CosyVoice3-0.5B')"
```

Если скачиваете модель в локальный каталог как в примере, укажите `COSYVOICE_MODEL_DIR=pretrained_models/Fun-CosyVoice3-0.5B`. Без этого значения генератор попробует отдать ModelScope ID напрямую в `AutoModel`.

Для `COSYVOICE_MODE=instruct2` нужен `COSYVOICE_REF_AUDIO`. Для `COSYVOICE_MODE=zero_shot` дополнительно нужен `COSYVOICE_REF_TEXT`.

Файл на входе должен быть формата обычных карточек или карточек с заголовками уроков:

```text
urok 3
人;rén<br>Человек
你;nǐ<br>Ты, вы
```

Заголовки уроков игнорируются при генерации аудио. Манифест по-прежнему связывает `wav` с ключом `hanzi + pinyin + translation`, поэтому одинаковые слова из разных уроков могут переиспользовать один аудиофайл.

Полезные опции:

- `--force` — пересоздать аудио даже если файл уже есть
- `--limit 10` — сгенерировать только первые 10 карточек для проверки
- `--engine qwen|cosyvoice` — выбрать TTS-движок
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
- `COSYVOICE_REPO_DIR`
- `COSYVOICE_MODEL_DIR`
- `COSYVOICE_MODEL_ID`
- `COSYVOICE_MODE`
- `COSYVOICE_REF_AUDIO`
- `COSYVOICE_REF_TEXT`
- `COSYVOICE_INSTRUCT`
- `COSYVOICE_SPEED`

## Что внутри

- Поэтапное обучение: `иероглиф → перевод → иероглиф`
- Отдельная практика и тесты на пиньинь
- FSRS-планировщик повторений
- Статистика времени: общее, за сегодня, за сессию, среднее на карточку
- Пропись на обратной стороне карточки через `hanzi-writer`
- Опциональный рукописный ответ в тесте `перевод → иероглиф`
- Импорт строк вида `urok 3` и `人;rén<br>Человек`
- Хранение состояния в SQLite и `localStorage`

## Главные папки

- `app/` — страницы и глобальные стили
- `components/` — интерфейсные блоки
- `context/` — клиентское хранилище приложения
- `lib/` — типы, парсер, FSRS-логика и утилиты
