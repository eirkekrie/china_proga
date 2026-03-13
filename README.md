# Hanzi Flow

Учебное приложение для изучения китайских иероглифов на `Next.js + TypeScript + Tailwind CSS`.

## Запуск

```bash
npm install
npm run dev
```

После запуска откройте `http://localhost:3000`.

Для автоматического старта локальных AI-сервисов добавлены команды:

```bash
npm run services
```

Запускает сразу оба Python-сервиса:

- `scripts/qwen_tts_server.py`
- `scripts/pronunciation_server.py`

И полная локальная команда:

```bash
npm run dev:full
```

Она поднимает и оба Python-сервиса, и `next dev` в одном окне терминала.

## SQLite

Приложение теперь хранит состояние не только в `localStorage`, но и в SQLite через route `app/api/state/route.ts`.

- файл базы по умолчанию: `data/hanzi-flow.db`
- основное состояние: карточки, статистика и тема
- `localStorage` оставлен как локальный кэш и fallback

Путь к файлу можно переопределить через `DATABASE_PATH`.

## Docker

Для контейнерного запуска добавлены:

- `Dockerfile`
- `docker-compose.yml`

Запуск:

```bash
docker compose up --build
```

По умолчанию контейнер публикуется на `http://localhost:3001`, а база сохраняется в каталоге `data/`.

Если `3001` тоже занят, в PowerShell можно выбрать другой порт:

```powershell
$env:WEB_PORT=3002
docker compose up --build
```

Если хотите использовать `3000`, сначала остановите локальный `npm run dev` или другой процесс, который уже слушает этот порт.

## Улучшенный TTS

Для более качественного произношения приложение использует локальный `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice` через серверный route `app/api/tts/route.ts` и отдельный Python-сервер `scripts/qwen_tts_server.py`.

По умолчанию используется встроенный спикер модели, поэтому референсный `.wav` больше не обязателен.

### Архитектура озвучки

Теперь у приложения три уровня воспроизведения:

1. Готовый аудиофайл из `public/audio/cards`
2. Локальный live TTS через `scripts/qwen_tts_server.py`
3. Браузерный `speechSynthesis` как последний fallback

Предзаписанная озвучка хранится в:

- `public/audio/cards/*.wav`
- `public/audio/cards/manifest.json`

Манифест связывает карточку с аудиофайлом не по случайному `id`, а по стабильному ключу из `hanzi + pinyin + translation`. Поэтому аудио продолжает работать даже после повторного импорта карточек.

Основные параметры:

- `QWEN_TTS_SPEAKER` — имя встроенного голоса, по умолчанию `vivian`
- `QWEN_TTS_INSTRUCT` — необязательная инструкция по стилю речи
- `QWEN_TTS_LANGUAGE` — язык синтеза, для китайских карточек лучше оставить `Chinese`

### Настройка локального Qwen TTS

1. Создайте `.env.local`
2. Скопируйте значения из `.env.example`
3. При необходимости поменяйте `QWEN_TTS_SPEAKER` и `QWEN_TTS_INSTRUCT`
4. Установите Python-зависимости:

```bash
pip install -r requirements-qwen-tts.txt
```

5. Запустите локальный TTS-сервер:

```bash
python scripts/qwen_tts_server.py
```

6. В другом терминале запустите веб-приложение:

```bash
npm run dev
```

По умолчанию используются:

- `QWEN_TTS_SERVER_URL=http://127.0.0.1:8001/synthesize`
- `QWEN_TTS_MODEL=Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice`
- `QWEN_TTS_LANGUAGE=Chinese`
- `QWEN_TTS_SPEAKER=vivian`
- `QWEN_TTS_ATTN_IMPLEMENTATION=sdpa`

Если локальный Qwen-сервер недоступен, приложение автоматически откатится на браузерный `speechSynthesis`.

Если у вас есть CUDA и собранный `flash-attn`, можно поменять `QWEN_TTS_ATTN_IMPLEMENTATION` на `flash_attention_2`. Для Windows и CPU-первого запуска безопаснее оставить `sdpa`.

Поддерживаемые китайские встроенные голоса для `CustomVoice`: `vivian`, `serena`, `uncle_fu`, `dylan`, `eric`.

Если позже захотите вернуться к `Base`-модели для voice clone, сервер это тоже умеет. Тогда нужно снова заполнить `QWEN_TTS_REF_AUDIO` и `QWEN_TTS_REF_TEXT`.

### Пакетная генерация аудио

Для офлайн-озвучки карточек добавлен отдельный генератор:

```bash
python scripts/generate_card_audio.py --input path/to/cards.txt
```

или через npm:

```bash
npm run generate:audio -- --input path/to/cards.txt
```

Файл на входе должен быть тем же форматом, что и импорт карточек:

```text
人;rén<br>Человек
你;nǐ<br>Ты, вы
```

Полезные опции:

- `--force` — пересоздать аудио даже если файл уже есть
- `--limit 10` — сгенерировать только первые 10 карточек для проверки
- `--output-dir public/audio/cards` — изменить каталог аудиофайлов
- `--manifest public/audio/cards/manifest.json` — изменить путь манифеста

После генерации фронтенд автоматически будет использовать готовые `.wav` раньше live TTS.

## Распознавание произношения

Для `Stage 4` и теста произношения приложение теперь умеет записывать голос с микрофона и отправлять запись в локальный open-source сервис распознавания.

Текущий стек:

- `FunAudioLLM/SenseVoiceSmall` через `FunASR`
- локальный сервер `scripts/pronunciation_server.py`
- Next route `app/api/pronunciation/route.ts`
- оценка по распознанному слову, pinyin и совпадению тонов

### Настройка pronunciation server

1. Скопируйте новые переменные из `.env.example` в `.env.local`
2. Установите зависимости:

```bash
pip install -r requirements-pronunciation.txt
```

3. Запустите локальный сервис:

```bash
python scripts/pronunciation_server.py
```

или:

```bash
npm run pronunciation:server
```

По умолчанию используются:

- `PRONUNCIATION_SERVER_URL=http://127.0.0.1:8002/assess`
- `PRONUNCIATION_MODEL=iic/SenseVoiceSmall`
- `PRONUNCIATION_MODEL_HUB=ms`
- `PRONUNCIATION_TRUST_REMOTE_CODE=true`
- `PRONUNCIATION_REMOTE_CODE=https://raw.githubusercontent.com/FunAudioLLM/SenseVoice/main/model.py`
- `PRONUNCIATION_LANGUAGE=zh`

Для Windows это надёжнее, чем путь через Hugging Face, потому что у `hf` часто всплывает проблема с symlink-правами (`WinError 1314`).

### Как это работает в приложении

1. Пользователь нажимает `Начать запись`
2. Браузер записывает голос с микрофона
3. Локальный SenseVoice распознаёт сказанное
4. Сервис сравнивает распознанное слово с ожидаемым `hanzi` и `pinyin`
5. UI показывает:

- итоговый score
- score по слову
- score по pinyin
- score по тонам
- рекомендацию `Не знаю / Трудно / Знаю`

В тесте режим произношения доступен сразу для всех карточек, даже если пользователь ещё не прошёл первые этапы обучения. Для этого режима интерфейс показывает и иероглиф, и пиньинь одновременно.

Это практическая оценка произношения, а не академический phone-level scorer. Она подходит для тренировки слов и коротких фраз и хорошо встраивается в текущую карточную механику.

## Что внутри

- Поэтапное обучение: `иероглиф → перевод → иероглиф → пиньинь → произношение`
- Forgetting curve на основе `memoryStrength`, `forgettingScore`, `lastSeenAt`, `nextReviewAt`
- Статистика времени: общее, за сегодня, за сессию, среднее на карточку
- Пропись на обратной стороне карточки через `hanzi-writer`
- Опциональный рукописный ответ в тесте `перевод → иероглиф`
- Импорт строк вида `人;rén<br>Человек`
- Хранение состояния в `localStorage`

## Главные папки

- `app/` — страницы и глобальные стили
- `components/` — интерфейсные блоки
- `context/` — клиентское хранилище приложения
- `lib/` — типы, парсер, forgetting logic и утилиты
