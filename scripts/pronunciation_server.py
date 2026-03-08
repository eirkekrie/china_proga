from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from pronunciation_runtime import PronunciationRuntime, SETTINGS


RUNTIME = PronunciationRuntime()


class PronunciationRequestHandler(BaseHTTPRequestHandler):
    server_version = "SenseVoicePronunciation/1.0"

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
                "modelId": RUNTIME._loaded_model_id,
                "hub": RUNTIME._loaded_model_hub,
                "language": SETTINGS.language,
                "loaded": RUNTIME.load_model() is not None,
            },
        )

    def do_POST(self) -> None:
        if self.path != "/assess":
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

        try:
            payload = RUNTIME.assess(
                audio_base64=str(body.get("audioBase64", "")),
                mime_type=str(body.get("mimeType", "application/octet-stream")),
                expected_hanzi=str(body.get("expectedHanzi", "")),
                expected_pinyin=str(body.get("expectedPinyin", "")),
                duration_ms=int(body.get("durationMs", 0) or 0),
                language=str(body.get("language", "")).strip() or SETTINGS.language,
            )
        except Exception as exc:  # noqa: BLE001
            self.send_json(
                503,
                {
                    "error": "Local pronunciation assessment failed.",
                    "details": str(exc),
                },
            )
            return

        self.send_json(200, payload)


def main() -> None:
    print(f"Starting pronunciation server on http://{SETTINGS.host}:{SETTINGS.port}", flush=True)
    print(f"Model: {SETTINGS.model_id}", flush=True)
    print(f"Hub: {SETTINGS.model_hub}", flush=True)

    try:
        RUNTIME.load_model()
        print(f"Resolved model: {RUNTIME._loaded_model_id}", flush=True)
        print(f"Resolved hub: {RUNTIME._loaded_model_hub}", flush=True)
        print("Pronunciation model loaded and ready.", flush=True)
    except Exception as exc:  # noqa: BLE001
        print(f"Failed to load pronunciation model: {exc}", file=sys.stderr, flush=True)
        raise

    server = ThreadingHTTPServer((SETTINGS.host, SETTINGS.port), PronunciationRequestHandler)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
