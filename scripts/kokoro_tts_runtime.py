from __future__ import annotations

import io
import os
from dataclasses import dataclass
from threading import Lock

from qwen_tts_runtime import REPO_ROOT, load_env_file


def log(message: str) -> None:
    print(message, flush=True)


@dataclass(frozen=True)
class KokoroSettings:
    model_id: str
    lang_code: str
    voice: str
    device: str
    speed: float

    @classmethod
    def from_env(cls) -> "KokoroSettings":
        return cls(
            model_id=os.getenv("KOKORO_MODEL_ID", "hexgrad/Kokoro-82M").strip() or "hexgrad/Kokoro-82M",
            lang_code=os.getenv("KOKORO_LANG_CODE", "z").strip() or "z",
            voice=os.getenv("KOKORO_VOICE", "zf_xiaoxiao").strip() or "zf_xiaoxiao",
            device=os.getenv("KOKORO_DEVICE", "auto").strip() or "auto",
            speed=float(os.getenv("KOKORO_SPEED", "0.9")),
        )


load_env_file(REPO_ROOT / ".env")
load_env_file(REPO_ROOT / ".env.local")


class KokoroTTSRuntime:
    def __init__(self, settings: KokoroSettings | None = None):
        self.settings = settings or KokoroSettings.from_env()
        self._lock = Lock()
        self._pipeline = None

    @property
    def model_mode(self) -> str:
        return f"lang_{self.settings.lang_code}"

    def get_selected_speaker(self) -> str:
        return self.settings.voice

    def load_model(self):
        if self._pipeline is not None:
            return self._pipeline

        with self._lock:
            if self._pipeline is not None:
                return self._pipeline

            try:
                log("Loading Kokoro runtime. Importing PyTorch may take a minute on the first run...")
                from kokoro import KPipeline
            except ImportError as exc:
                raise RuntimeError(
                    "kokoro is not installed. Run `pip install -r requirements-kokoro-tts.txt`."
                ) from exc

            device = None if self.settings.device == "auto" else self.settings.device
            log(
                f"Loading {self.settings.model_id} "
                f"(lang={self.settings.lang_code}, voice={self.settings.voice}, device={self.settings.device})..."
            )
            self._pipeline = KPipeline(
                lang_code=self.settings.lang_code,
                repo_id=self.settings.model_id,
                device=device,
            )
            log("Kokoro model is ready.")
            return self._pipeline

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
            raise RuntimeError(
                "numpy and soundfile are required for Kokoro wav serialization. "
                "Run `pip install -r requirements-kokoro-tts.txt`."
            ) from exc

        normalized_text = text.strip()
        if not normalized_text:
            raise ValueError("Text is required.")

        pipeline = self.load_model()
        audio_parts = []
        for result in pipeline(
            normalized_text,
            voice=self.settings.voice,
            speed=self.settings.speed,
            split_pattern=r"\n+",
        ):
            audio = result.audio
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
            raise RuntimeError("Kokoro returned an empty audio response.")

        audio = np.concatenate(audio_parts) if len(audio_parts) > 1 else audio_parts[0]

        buffer = io.BytesIO()
        sf.write(buffer, audio, 24000, format="WAV")
        return buffer.getvalue()
