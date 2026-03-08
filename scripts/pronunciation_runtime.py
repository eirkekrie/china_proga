from __future__ import annotations

import base64
import os
import re
import tempfile
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from threading import Lock
from typing import Any

from pypinyin import Style, lazy_pinyin
from pypinyin.contrib.tone_convert import to_tone3


class ConfigError(RuntimeError):
    pass


TOKEN_PATTERN = re.compile(r"<\|[^>]+\|>")
WHITESPACE_PATTERN = re.compile(r"\s+")
SYLLABLE_PATTERN = re.compile(r"([a-zv]+)([1-5]?)", re.IGNORECASE)
DEFAULT_REMOTE_CODE = "https://raw.githubusercontent.com/FunAudioLLM/SenseVoice/main/model.py"


def load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if value[:1] in {'"', "'"} and value[-1:] == value[:1]:
            value = value[1:-1]
        os.environ.setdefault(key, value)


def resolve_repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def env_flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
      return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class PronunciationSettings:
    host: str
    port: int
    model_id: str
    model_hub: str
    trust_remote_code: bool
    remote_code: str
    disable_update: bool
    language: str
    device: str

    @classmethod
    def from_env(cls) -> "PronunciationSettings":
        return cls(
            host=os.getenv("PRONUNCIATION_HOST", "127.0.0.1").strip() or "127.0.0.1",
            port=int(os.getenv("PRONUNCIATION_PORT", "8002")),
            model_id=os.getenv("PRONUNCIATION_MODEL", "iic/SenseVoiceSmall").strip()
            or "iic/SenseVoiceSmall",
            model_hub=os.getenv("PRONUNCIATION_MODEL_HUB", "ms").strip() or "ms",
            trust_remote_code=env_flag("PRONUNCIATION_TRUST_REMOTE_CODE", True),
            remote_code=os.getenv("PRONUNCIATION_REMOTE_CODE", DEFAULT_REMOTE_CODE).strip() or DEFAULT_REMOTE_CODE,
            disable_update=env_flag("PRONUNCIATION_DISABLE_UPDATE", True),
            language=os.getenv("PRONUNCIATION_LANGUAGE", "zh").strip() or "zh",
            device=os.getenv("PRONUNCIATION_DEVICE", "auto").strip() or "auto",
        )


REPO_ROOT = resolve_repo_root()
load_env_file(REPO_ROOT / ".env")
load_env_file(REPO_ROOT / ".env.local")
SETTINGS = PronunciationSettings.from_env()


def normalize_text(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    without_marks = "".join(char for char in decomposed if not unicodedata.combining(char))
    cleaned = "".join(char for char in without_marks.lower() if char.isalnum() or "\u4e00" <= char <= "\u9fff" or char.isspace())
    return WHITESPACE_PATTERN.sub(" ", cleaned).strip()


def normalize_pinyin(value: str) -> str:
    tone3 = to_tone3(value, neutral_tone_with_five=True)
    tone3 = tone3.lower().replace("ü", "v").replace("u:", "v")
    cleaned = "".join(char for char in tone3 if char.isalnum() or char.isspace())
    return WHITESPACE_PATTERN.sub(" ", cleaned).strip()


def transcript_to_pinyin(value: str) -> str:
    if not value.strip():
        return ""

    return normalize_pinyin(
        " ".join(
            lazy_pinyin(
                value,
                style=Style.TONE3,
                neutral_tone_with_five=True,
                errors="ignore",
            )
        )
    )


def similarity_score(left: str, right: str) -> int:
    if not left and not right:
        return 100
    if not left or not right:
        return 0
    return round(SequenceMatcher(None, left, right).ratio() * 100)


def tone_score(expected_pinyin: str, recognized_pinyin: str) -> int:
    expected_syllables = [match.groups() for match in SYLLABLE_PATTERN.finditer(expected_pinyin) if match.group(1)]
    recognized_syllables = [match.groups() for match in SYLLABLE_PATTERN.finditer(recognized_pinyin) if match.group(1)]

    max_len = max(len(expected_syllables), len(recognized_syllables))
    if max_len == 0:
        return 0

    matches = 0
    for index in range(min(len(expected_syllables), len(recognized_syllables))):
        expected_base, expected_tone = expected_syllables[index]
        recognized_base, recognized_tone = recognized_syllables[index]
        if expected_base == recognized_base:
            matches += 0.5
        if expected_tone == recognized_tone:
            matches += 0.5

    return round(matches / max_len * 100)


def cleanup_transcript(raw_text: str) -> str:
    cleaned = TOKEN_PATTERN.sub(" ", raw_text)
    cleaned = cleaned.replace("❓", " ").replace("🎼", " ").replace("😊", " ")
    return WHITESPACE_PATTERN.sub(" ", cleaned).strip()


def choose_feedback(overall_score: int, transcript_score_value: int, pinyin_score_value: int, tone_score_value: int) -> str:
    if overall_score >= 88:
        return "Произношение уверенное. Можно двигаться дальше."
    if tone_score_value < 55:
        return "Слоги распознаны, но тоны слышатся нестабильно. Повторите слово медленнее."
    if pinyin_score_value < 60:
        return "Распознавание слышит близкое звучание, но слоги съезжают. Сравните с эталоном."
    if transcript_score_value < 50:
        return "Сервис распознал другое слово. Попробуйте говорить короче и чётче."
    return "Произношение частично верное. Нужна ещё одна попытка для закрепления."


def choose_grade(overall_score: int) -> str:
    if overall_score >= 85:
        return "good"
    if overall_score >= 60:
        return "hard"
    return "again"


class PronunciationRuntime:
    def __init__(self, settings: PronunciationSettings = SETTINGS):
        self.settings = settings
        self._lock = Lock()
        self._model = None
        self._loaded_model_id = settings.model_id
        self._loaded_model_hub = settings.model_hub

    def _resolve_device(self) -> str:
        if self.settings.device != "auto":
            return self.settings.device

        try:
            import torch
        except ImportError:
            return "cpu"

        return "cuda:0" if torch.cuda.is_available() else "cpu"

    def load_model(self):
        if self._model is not None:
            return self._model

        with self._lock:
            if self._model is not None:
                return self._model

            try:
                from funasr import AutoModel
            except ImportError as exc:
                raise RuntimeError(
                    "funasr is not installed. Run `pip install -r requirements-pronunciation.txt`."
                ) from exc

            load_attempts = self._build_load_attempts()
            errors: list[str] = []

            for attempt in load_attempts:
                try:
                    self._model = AutoModel(**attempt)
                    self._loaded_model_id = str(attempt["model"])
                    self._loaded_model_hub = str(attempt.get("hub", "ms"))
                    return self._model
                except Exception as exc:  # noqa: BLE001
                    errors.append(f'{attempt["hub"]}:{attempt["model"]} -> {exc}')

            raise RuntimeError(
                "SenseVoice model failed to load. Attempts: " + " | ".join(errors)
            )

    def _build_load_attempts(self) -> list[dict[str, Any]]:
        device = self._resolve_device()
        common: dict[str, Any] = {
            "vad_model": "fsmn-vad",
            "vad_kwargs": {"max_single_segment_time": 30000},
            "device": device,
            "disable_update": self.settings.disable_update,
        }

        attempts: list[dict[str, Any]] = []

        primary_attempt: dict[str, Any] = {
            **common,
            "model": self.settings.model_id,
            "hub": self.settings.model_hub,
        }
        if self.settings.trust_remote_code:
            primary_attempt["trust_remote_code"] = True
            if self.settings.remote_code:
                primary_attempt["remote_code"] = self.settings.remote_code
        attempts.append(primary_attempt)

        fallback_model_id = "iic/SenseVoiceSmall"
        fallback_hub = "ms"
        if not (
            self.settings.model_id == fallback_model_id
            and self.settings.model_hub == fallback_hub
            and self.settings.trust_remote_code
        ):
            attempts.append(
                {
                    **common,
                    "model": fallback_model_id,
                    "hub": fallback_hub,
                    "trust_remote_code": True,
                    "remote_code": self.settings.remote_code or DEFAULT_REMOTE_CODE,
                }
            )

        return attempts

    def transcribe(self, audio_bytes: bytes, mime_type: str, language: str | None = None) -> str:
        model = self.load_model()
        suffix = {
            "audio/webm": ".webm",
            "audio/ogg": ".ogg",
            "audio/mp4": ".m4a",
            "audio/mpeg": ".mp3",
            "audio/wav": ".wav",
            "audio/x-wav": ".wav",
        }.get(mime_type.lower(), ".webm")

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temporary_file:
            temporary_file.write(audio_bytes)
            temp_path = temporary_file.name

        try:
            result = model.generate(
                input=temp_path,
                cache={},
                language=language or self.settings.language,
                use_itn=False,
                batch_size_s=0,
                merge_vad=True,
                merge_length_s=15,
            )
        finally:
            try:
                os.remove(temp_path)
            except OSError:
                pass

        raw_text = str(result[0].get("text", "") if result else "")

        try:
            from funasr.utils.postprocess_utils import rich_transcription_postprocess

            raw_text = rich_transcription_postprocess(raw_text)
        except Exception:
            pass

        return cleanup_transcript(raw_text)

    def assess(
        self,
        audio_base64: str,
        mime_type: str,
        expected_hanzi: str,
        expected_pinyin: str,
        duration_ms: int = 0,
        language: str | None = None,
    ) -> dict[str, object]:
        if not expected_hanzi.strip() or not expected_pinyin.strip():
            raise ValueError("Expected hanzi and pinyin are required.")

        try:
            audio_bytes = base64.b64decode(audio_base64)
        except Exception as exc:
            raise ValueError("Invalid base64 audio payload.") from exc

        transcript = self.transcribe(audio_bytes, mime_type=mime_type, language=language)
        normalized_transcript = normalize_text(transcript)
        normalized_expected_hanzi = normalize_text(expected_hanzi)
        normalized_expected_pinyin = normalize_pinyin(expected_pinyin)
        recognized_pinyin = transcript_to_pinyin(transcript)

        transcript_score_value = similarity_score(normalized_expected_hanzi, normalized_transcript)
        pinyin_score_value = similarity_score(normalized_expected_pinyin, recognized_pinyin)
        tone_score_value = tone_score(normalized_expected_pinyin, recognized_pinyin)
        overall_score = round(
            transcript_score_value * 0.45 + pinyin_score_value * 0.35 + tone_score_value * 0.20
        )
        feedback = choose_feedback(overall_score, transcript_score_value, pinyin_score_value, tone_score_value)

        return {
            "transcript": transcript,
            "normalizedTranscript": normalized_transcript,
            "recognizedPinyin": recognized_pinyin,
            "expectedHanzi": expected_hanzi,
            "expectedPinyin": expected_pinyin,
            "transcriptScore": transcript_score_value,
            "pinyinScore": pinyin_score_value,
            "toneScore": tone_score_value,
            "overallScore": overall_score,
            "grade": choose_grade(overall_score),
            "feedback": feedback,
            "engine": "sensevoice-local",
            "language": language or self.settings.language,
            "durationMs": max(0, int(duration_ms or 0)),
        }
