from __future__ import annotations

import io
import os
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Any


class ConfigError(RuntimeError):
    pass


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


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    model_id: str
    language: str
    device: str
    dtype: str
    attn_implementation: str
    speaker: str
    instruct: str
    ref_audio: Path | None
    ref_text: str

    @classmethod
    def from_env(cls, repo_root: Path) -> "Settings":
        ref_audio_raw = os.getenv("QWEN_TTS_REF_AUDIO", "").strip()
        ref_text = os.getenv("QWEN_TTS_REF_TEXT", "").strip()
        ref_audio = None
        if ref_audio_raw:
            ref_audio = Path(ref_audio_raw)
            if not ref_audio.is_absolute():
                ref_audio = (repo_root / ref_audio).resolve()

            if not ref_audio.exists():
                raise ConfigError(f"Reference audio file was not found: {ref_audio}")

        return cls(
            host=os.getenv("QWEN_TTS_HOST", "127.0.0.1").strip() or "127.0.0.1",
            port=int(os.getenv("QWEN_TTS_PORT", "8001")),
            model_id=os.getenv("QWEN_TTS_MODEL", "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice").strip()
            or "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
            language=os.getenv("QWEN_TTS_LANGUAGE", "Chinese").strip() or "Chinese",
            device=os.getenv("QWEN_TTS_DEVICE", "auto").strip() or "auto",
            dtype=os.getenv("QWEN_TTS_DTYPE", "auto").strip() or "auto",
            attn_implementation=os.getenv("QWEN_TTS_ATTN_IMPLEMENTATION", "sdpa").strip() or "sdpa",
            speaker=os.getenv("QWEN_TTS_SPEAKER", "vivian").strip() or "vivian",
            instruct=os.getenv("QWEN_TTS_INSTRUCT", "").strip(),
            ref_audio=ref_audio,
            ref_text=ref_text,
        )


def get_model_mode(model_id: str) -> str:
    normalized = model_id.lower()
    if "customvoice" in normalized:
        return "custom_voice"
    if "base" in normalized:
        return "voice_clone"
    raise ConfigError("Unable to infer Qwen TTS mode from QWEN_TTS_MODEL.")


REPO_ROOT = resolve_repo_root()
load_env_file(REPO_ROOT / ".env")
load_env_file(REPO_ROOT / ".env.local")
SETTINGS = Settings.from_env(REPO_ROOT)


class QwenTTSRuntime:
    def __init__(self, settings: Settings = SETTINGS):
        self.settings = settings
        self._lock = Lock()
        self._model = None
        self._selected_speaker: str | None = None

    @property
    def model_mode(self) -> str:
        return get_model_mode(self.settings.model_id)

    def get_selected_speaker(self) -> str:
        return self._selected_speaker or self.settings.speaker

    def _resolve_runtime_options(self):
        try:
            import torch
        except ImportError as exc:
            raise RuntimeError("PyTorch is not installed. Install it before starting Qwen TTS.") from exc

        device = self.settings.device
        if device == "auto":
            device = "cuda:0" if torch.cuda.is_available() else "cpu"

        dtype_name = self.settings.dtype
        if dtype_name == "auto":
            dtype = torch.bfloat16 if device.startswith("cuda") else torch.float32
        else:
            try:
                dtype = getattr(torch, dtype_name)
            except AttributeError as exc:
                raise RuntimeError(f"Unsupported QWEN_TTS_DTYPE value: {dtype_name}") from exc

        return device, dtype

    def _resolve_custom_speaker(self, model) -> str:
        supported_speakers = list(model.get_supported_speakers() or [])
        if not supported_speakers:
            return self.settings.speaker

        speaker_by_key = {speaker.strip().lower(): speaker for speaker in supported_speakers}
        requested_key = self.settings.speaker.strip().lower()
        resolved_speaker = speaker_by_key.get(requested_key)
        if resolved_speaker:
            return resolved_speaker

        raise RuntimeError(
            f"Unsupported QWEN_TTS_SPEAKER `{self.settings.speaker}`. Available speakers: {', '.join(sorted(supported_speakers))}"
        )

    def load_model(self):
        if self._model is not None:
            return self._model

        with self._lock:
            if self._model is not None:
                return self._model

            try:
                from qwen_tts import Qwen3TTSModel
            except ImportError as exc:
                raise RuntimeError(
                    "qwen-tts is not installed. Run `pip install -r requirements-qwen-tts.txt`."
                ) from exc

            device, dtype = self._resolve_runtime_options()
            load_kwargs: dict[str, Any] = {
                "device_map": device,
                "dtype": dtype,
            }

            if self.settings.attn_implementation:
                load_kwargs["attn_implementation"] = self.settings.attn_implementation

            self._model = Qwen3TTSModel.from_pretrained(self.settings.model_id, **load_kwargs)
            if self.model_mode == "custom_voice":
                self._selected_speaker = self._resolve_custom_speaker(self._model)

            return self._model

    def synthesize_wav_bytes(self, text: str, language: str | None = None) -> bytes:
        try:
            import soundfile as sf
        except ImportError as exc:
            raise RuntimeError("soundfile is not installed. Run `pip install -r requirements-qwen-tts.txt`.") from exc

        normalized_text = text.strip()
        if not normalized_text:
            raise ValueError("Text is required.")

        model = self.load_model()
        language_value = (language or self.settings.language).strip() or self.settings.language

        if self.model_mode == "custom_voice":
            generation_kwargs: dict[str, Any] = {
                "text": normalized_text,
                "language": language_value,
                "speaker": self.get_selected_speaker(),
            }
            if self.settings.instruct:
                generation_kwargs["instruct"] = self.settings.instruct
            wavs, sample_rate = model.generate_custom_voice(**generation_kwargs)
        else:
            if self.settings.ref_audio is None or not self.settings.ref_text:
                raise RuntimeError(
                    "Base voice-clone model requires both QWEN_TTS_REF_AUDIO and QWEN_TTS_REF_TEXT."
                )

            wavs, sample_rate = model.generate_voice_clone(
                text=normalized_text,
                language=language_value,
                ref_audio=str(self.settings.ref_audio),
                ref_text=self.settings.ref_text,
            )

        if not wavs:
            raise RuntimeError("Qwen returned an empty audio response.")

        audio = wavs[0]
        if hasattr(audio, "detach"):
            audio = audio.detach()
        if hasattr(audio, "cpu"):
            audio = audio.cpu()
        if hasattr(audio, "numpy"):
            audio = audio.numpy()

        buffer = io.BytesIO()
        sf.write(buffer, audio, sample_rate, format="WAV")
        return buffer.getvalue()
