from __future__ import annotations

import io
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Any, Iterable

from qwen_tts_runtime import REPO_ROOT, ConfigError, load_env_file


DEFAULT_PROMPT_PREFIX = (
    "You are a helpful assistant. "
    "Speak standard Mandarin slowly and clearly, with accurate tones."
    "<|endofprompt|>"
)


def parse_bool(value: str, default: bool = False) -> bool:
    normalized = value.strip().lower()
    if not normalized:
        return default
    return normalized in {"1", "true", "yes", "y", "on"}


def resolve_existing_path(raw_value: str, base_dir: Path, description: str) -> Path:
    value = raw_value.strip()
    if not value:
        raise ConfigError(f"{description} is required.")

    path = Path(value)
    if not path.is_absolute():
        path = (base_dir / path).resolve()

    if not path.exists():
        raise ConfigError(f"{description} was not found: {path}")

    return path


def resolve_model_dir(raw_value: str, repo_dir: Path) -> str:
    value = raw_value.strip()
    if not value:
        raise ConfigError("COSYVOICE_MODEL_DIR is required.")

    path = Path(value)
    candidates = []
    if path.is_absolute():
        candidates.append(path)
    else:
        candidates.extend([(repo_dir / path).resolve(), (REPO_ROOT / path).resolve()])

    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    return value


@dataclass(frozen=True)
class CosyVoiceSettings:
    repo_dir: Path
    model_dir: str
    model_id: str
    mode: str
    ref_audio: Path
    ref_text: str
    prompt_prefix: str
    instruct: str
    speed: float
    text_frontend: bool
    fp16: bool
    load_trt: bool
    load_vllm: bool
    trt_concurrent: int

    @classmethod
    def from_env(cls, repo_root: Path) -> "CosyVoiceSettings":
        repo_dir = resolve_existing_path(
            os.getenv("COSYVOICE_REPO_DIR", "assets/cosyvoice/CosyVoice"),
            repo_root,
            "CosyVoice repository",
        )
        model_dir = resolve_model_dir(
            os.getenv("COSYVOICE_MODEL_DIR", "FunAudioLLM/Fun-CosyVoice3-0.5B-2512"),
            repo_dir,
        )
        ref_audio = resolve_existing_path(
            os.getenv("COSYVOICE_REF_AUDIO", ""),
            repo_root,
            "COSYVOICE_REF_AUDIO",
        )
        mode = os.getenv("COSYVOICE_MODE", "instruct2").strip().lower() or "instruct2"
        if mode not in {"instruct2", "zero_shot", "cross_lingual"}:
            raise ConfigError("COSYVOICE_MODE must be one of: instruct2, zero_shot, cross_lingual.")

        ref_text = os.getenv("COSYVOICE_REF_TEXT", "").strip()
        if mode == "zero_shot" and not ref_text:
            raise ConfigError("COSYVOICE_REF_TEXT is required when COSYVOICE_MODE=zero_shot.")

        return cls(
            repo_dir=repo_dir,
            model_dir=model_dir,
            model_id=os.getenv("COSYVOICE_MODEL_ID", Path(model_dir).name).strip() or Path(model_dir).name,
            mode=mode,
            ref_audio=ref_audio,
            ref_text=ref_text,
            prompt_prefix=os.getenv("COSYVOICE_PROMPT_PREFIX", DEFAULT_PROMPT_PREFIX).strip() or DEFAULT_PROMPT_PREFIX,
            instruct=os.getenv(
                "COSYVOICE_INSTRUCT",
                "You are a helpful assistant. Please read this Chinese vocabulary item in standard Mandarin, slowly and clearly, with accurate tones.<|endofprompt|>",
            ).strip(),
            speed=float(os.getenv("COSYVOICE_SPEED", "1.0")),
            text_frontend=parse_bool(os.getenv("COSYVOICE_TEXT_FRONTEND", "1"), default=True),
            fp16=parse_bool(os.getenv("COSYVOICE_FP16", "0")),
            load_trt=parse_bool(os.getenv("COSYVOICE_LOAD_TRT", "0")),
            load_vllm=parse_bool(os.getenv("COSYVOICE_LOAD_VLLM", "0")),
            trt_concurrent=int(os.getenv("COSYVOICE_TRT_CONCURRENT", "1")),
        )


load_env_file(REPO_ROOT / ".env")
load_env_file(REPO_ROOT / ".env.local")


class CosyVoiceRuntime:
    def __init__(self, settings: CosyVoiceSettings | None = None):
        self.settings = settings or CosyVoiceSettings.from_env(REPO_ROOT)
        self._lock = Lock()
        self._model = None

    @property
    def model_mode(self) -> str:
        return self.settings.mode

    def get_selected_speaker(self) -> str:
        return self.settings.ref_audio.stem

    def _prepare_import_path(self) -> None:
        paths = [self.settings.repo_dir, self.settings.repo_dir / "third_party" / "Matcha-TTS"]
        for path in paths:
            path_string = str(path)
            if path.exists() and path_string not in sys.path:
                sys.path.insert(0, path_string)

    def load_model(self):
        if self._model is not None:
            return self._model

        with self._lock:
            if self._model is not None:
                return self._model

            self._prepare_import_path()
            try:
                from cosyvoice.cli.cosyvoice import AutoModel
            except ImportError as exc:
                raise RuntimeError(
                    "CosyVoice is not importable. Clone FunAudioLLM/CosyVoice with submodules "
                    "and install its requirements in the active Python environment."
                ) from exc

            self._model = AutoModel(
                model_dir=self.settings.model_dir,
                load_trt=self.settings.load_trt,
                load_vllm=self.settings.load_vllm,
                fp16=self.settings.fp16,
                trt_concurrent=self.settings.trt_concurrent,
            )
            return self._model

    def _iter_outputs(self, text: str, instruct: str | None = None) -> Iterable[dict[str, Any]]:
        model = self.load_model()
        common_kwargs = {
            "stream": False,
            "speed": self.settings.speed,
            "text_frontend": self.settings.text_frontend,
        }

        if self.settings.mode == "zero_shot":
            prompt_text = f"{self.settings.prompt_prefix}{self.settings.ref_text}"
            return model.inference_zero_shot(text, prompt_text, str(self.settings.ref_audio), **common_kwargs)

        if self.settings.mode == "cross_lingual":
            return model.inference_cross_lingual(text, str(self.settings.ref_audio), **common_kwargs)

        effective_instruct = " ".join(
            part.strip()
            for part in [self.settings.instruct, instruct or ""]
            if part and part.strip()
        ).strip()
        if "<|endofprompt|>" not in effective_instruct:
            effective_instruct = f"{effective_instruct}<|endofprompt|>"
        return model.inference_instruct2(text, effective_instruct, str(self.settings.ref_audio), **common_kwargs)

    def synthesize_wav_bytes(
        self,
        text: str,
        language: str | None = None,
        instruct: str | None = None,
    ) -> bytes:
        try:
            import numpy as np
            import soundfile as sf
        except ImportError as exc:
            raise RuntimeError("numpy and soundfile are required for CosyVoice wav serialization.") from exc

        normalized_text = text.strip()
        if not normalized_text:
            raise ValueError("Text is required.")

        audio_parts = []
        for output in self._iter_outputs(normalized_text, instruct=instruct):
            audio = output.get("tts_speech")
            if audio is None:
                continue
            if hasattr(audio, "detach"):
                audio = audio.detach()
            if hasattr(audio, "cpu"):
                audio = audio.cpu()
            if hasattr(audio, "numpy"):
                audio = audio.numpy()
            audio_parts.append(np.asarray(audio).squeeze())

        if not audio_parts:
            raise RuntimeError("CosyVoice returned an empty audio response.")

        audio = np.concatenate(audio_parts) if len(audio_parts) > 1 else audio_parts[0]

        buffer = io.BytesIO()
        sf.write(buffer, audio, self.load_model().sample_rate, format="WAV")
        return buffer.getvalue()
