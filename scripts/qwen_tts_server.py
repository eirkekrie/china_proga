from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from qwen_tts_runtime import QwenTTSRuntime, SETTINGS


RUNTIME = QwenTTSRuntime()


class QwenTTSRequestHandler(BaseHTTPRequestHandler):
    server_version = "Qwen3TTSLocal/1.1"

    def log_message(self, format: str, *args: object) -> None:
        sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), format % args))

    def send_json(self, status_code: int, payload: dict[str, object]) -> None:
        content = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self) -> None:
        if self.path != "/health":
            self.send_json(404, {"error": "Not found."})
            return

        self.send_json(
            200,
            {
                "ok": True,
                "modelId": SETTINGS.model_id,
                "mode": RUNTIME.model_mode,
                "language": SETTINGS.language,
                "speaker": RUNTIME.get_selected_speaker() if RUNTIME.model_mode == "custom_voice" else None,
                "refAudio": str(SETTINGS.ref_audio) if SETTINGS.ref_audio else None,
                "loaded": RUNTIME.load_model() is not None,
            },
        )

    def do_POST(self) -> None:
        if self.path != "/synthesize":
            self.send_json(404, {"error": "Not found."})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_json(400, {"error": "Invalid Content-Length header."})
            return

        raw_body = self.rfile.read(content_length)
        try:
            body = json.loads(raw_body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self.send_json(400, {"error": "Invalid JSON body."})
            return

        text = str(body.get("text", "")).strip()
        if not text:
            self.send_json(400, {"error": "Text is required."})
            return

        language = str(body.get("language", "")).strip() or SETTINGS.language

        try:
            audio_bytes = RUNTIME.synthesize_wav_bytes(text, language=language)
        except Exception as exc:  # noqa: BLE001
            self.send_json(
                503,
                {
                    "error": "Local Qwen TTS synthesis failed.",
                    "details": str(exc),
                },
            )
            return

        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(audio_bytes)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-TTS-Engine", "qwen3-tts-local")
        self.end_headers()
        self.wfile.write(audio_bytes)


def main() -> None:
    print(f"Starting local Qwen TTS server on http://{SETTINGS.host}:{SETTINGS.port}", flush=True)
    print(f"Model: {SETTINGS.model_id}", flush=True)
    print(f"Mode: {RUNTIME.model_mode}", flush=True)
    if RUNTIME.model_mode == "custom_voice":
        print(f"Speaker: {SETTINGS.speaker}", flush=True)
    else:
        print(f"Reference audio: {SETTINGS.ref_audio}", flush=True)

    try:
        RUNTIME.load_model()
        if RUNTIME.model_mode == "custom_voice":
            print(f"Resolved speaker: {RUNTIME.get_selected_speaker()}", flush=True)
        print("Model loaded and ready.", flush=True)
    except Exception as exc:  # noqa: BLE001
        print(f"Failed to load model: {exc}", file=sys.stderr, flush=True)
        raise

    server = ThreadingHTTPServer((SETTINGS.host, SETTINGS.port), QwenTTSRequestHandler)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
