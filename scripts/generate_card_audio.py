from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from cosyvoice_runtime import CosyVoiceRuntime
from kokoro_tts_runtime import KokoroTTSRuntime
from qwen_tts_runtime import REPO_ROOT, QwenTTSRuntime


PUNCTUATION_PATTERN = re.compile(r"""[.,!?;:()\[\]{}\"'`]""")
WHITESPACE_PATTERN = re.compile(r"\s+")
BREAK_PATTERN = re.compile(r"<br\s*/?>", re.IGNORECASE)
ASCII_SLUG_PATTERN = re.compile(r"[^a-z0-9]+")
LESSON_HEADER_PATTERN = re.compile(r"^(?:urok|урок)\s+(.+?)\s*:?\s*$", re.IGNORECASE)
TTS_ENGINES = ("kokoro", "qwen", "cosyvoice")


def log(message: str) -> None:
    print(message, flush=True)


@dataclass(frozen=True)
class ParsedCard:
    hanzi: str
    pinyin: str
    translation: str
    key: str


def normalize_text(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value.lower())
    without_marks = "".join(char for char in decomposed if not unicodedata.combining(char))
    without_punctuation = PUNCTUATION_PATTERN.sub(" ", without_marks)
    return WHITESPACE_PATTERN.sub(" ", without_punctuation).strip()


def normalize_pinyin(value: str) -> str:
    return normalize_text(value).replace("u:", "u").replace("v", "u")


def build_card_key(hanzi: str, pinyin: str, translation: str) -> str:
    return f"{normalize_text(hanzi)}|{normalize_pinyin(pinyin)}|{normalize_text(translation)}"


def parse_card_lines(raw_text: str) -> tuple[list[ParsedCard], list[str], list[str]]:
    lines = [line.strip() for line in raw_text.replace("\ufeff", "").splitlines() if line.strip()]

    cards: list[ParsedCard] = []
    duplicates: list[str] = []
    invalid_lines: list[str] = []
    seen_keys: set[str] = set()

    for line in lines:
        if LESSON_HEADER_PATTERN.match(line):
            continue

        split_by_break = BREAK_PATTERN.split(line)
        if len(split_by_break) != 2:
            invalid_lines.append(line)
            continue

        left, translation_raw = split_by_break
        left_parts = left.split(";")
        if len(left_parts) != 2:
            invalid_lines.append(line)
            continue

        hanzi = left_parts[0].strip()
        pinyin = left_parts[1].strip()
        translation = translation_raw.strip()

        if not hanzi or not pinyin or not translation:
            invalid_lines.append(line)
            continue

        key = build_card_key(hanzi, pinyin, translation)
        if key in seen_keys:
            duplicates.append(line)
            continue

        seen_keys.add(key)
        cards.append(ParsedCard(hanzi=hanzi, pinyin=pinyin, translation=translation, key=key))

    return cards, duplicates, invalid_lines


def build_filename(index: int, card: ParsedCard) -> str:
    pinyin_slug = ASCII_SLUG_PATTERN.sub("-", normalize_pinyin(card.pinyin)).strip("-") or "card"
    suffix = hashlib.sha1(card.key.encode("utf-8")).hexdigest()[:10]
    return f"{index + 1:04d}-{pinyin_slug[:32]}-{suffix}.wav"


def build_generation_instruct(card: ParsedCard) -> str:
    return (
        "Speak slowly and clearly, with careful articulation of each syllable "
        "and accurate Mandarin tones, like a teacher reading vocabulary "
        "for a beginner language learner. Use a calm, neutral voice."
    )


def build_generation_text(card: ParsedCard) -> str:
    return card.hanzi.strip()


def create_tts_runtime(engine: str):
    if engine == "kokoro":
        return KokoroTTSRuntime()
    if engine == "qwen":
        return QwenTTSRuntime()
    if engine == "cosyvoice":
        return CosyVoiceRuntime()
    raise ValueError(f"Unsupported TTS engine: {engine}")


def get_engine_manifest_name(engine: str) -> str:
    if engine == "kokoro":
        return "kokoro-82m-local"
    if engine == "qwen":
        return "qwen3-tts-local"
    if engine == "cosyvoice":
        return "cosyvoice3-local"
    return engine


def load_existing_manifest(path: Path) -> dict:
    if not path.exists():
        return {"version": 1, "entries": {}}

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"version": 1, "entries": {}}


def parse_arguments() -> argparse.Namespace:
    default_engine = os.getenv("CARD_AUDIO_TTS_ENGINE", "kokoro").strip() or "kokoro"
    parser = argparse.ArgumentParser(
        description="Generate pre-rendered audio files and manifest for Hanzi Flow cards."
    )
    parser.add_argument(
        "input_path",
        nargs="?",
        help="Path to a UTF-8 text file. This positional form is kept for npm argument forwarding quirks.",
    )
    parser.add_argument(
        "--input",
        default=None,
        help="Path to a UTF-8 text file with lines like дєє;rГ©n<br>Р§РµР»РѕРІРµРє",
    )
    parser.add_argument(
        "--output-dir",
        default=str(REPO_ROOT / "public" / "audio" / "cards"),
        help="Directory for generated wav files.",
    )
    parser.add_argument(
        "--manifest",
        default=str(REPO_ROOT / "public" / "audio" / "cards" / "manifest.json"),
        help="Path to the JSON manifest consumed by the frontend.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate files even if they already exist.",
    )
    parser.add_argument(
        "--engine",
        choices=TTS_ENGINES,
        default=default_engine,
        help="TTS engine to use for generation.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Optional number of cards to generate for a quick test.",
    )
    args = parser.parse_args()
    if not args.input:
        args.input = args.input_path
    elif args.input_path and args.input_path != args.input:
        parser.error("Provide the input file either as --input or as a positional argument, not both.")

    if not args.input:
        parser.error("the following arguments are required: --input or input_path")

    return args


def main() -> None:
    args = parse_arguments()

    input_path = Path(args.input)
    if not input_path.is_absolute():
        input_path = (REPO_ROOT / input_path).resolve()
    if not input_path.exists():
        raise FileNotFoundError(f"Input file was not found: {input_path}")

    output_dir = Path(args.output_dir)
    if not output_dir.is_absolute():
        output_dir = (REPO_ROOT / output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest_path = Path(args.manifest)
    if not manifest_path.is_absolute():
        manifest_path = (REPO_ROOT / manifest_path).resolve()
    manifest_path.parent.mkdir(parents=True, exist_ok=True)

    raw_text = input_path.read_text(encoding="utf-8")
    cards, duplicates, invalid_lines = parse_card_lines(raw_text)
    if args.limit > 0:
        cards = cards[: args.limit]

    if not cards:
        raise RuntimeError("No valid cards were found in the input file.")

    log(f"Loaded {len(cards)} cards from {input_path}.")
    log(f"Using TTS engine: {args.engine}.")
    runtime = create_tts_runtime(args.engine)
    runtime.load_model()
    engine_name = get_engine_manifest_name(args.engine)
    model_id = runtime.settings.model_id
    model_mode = runtime.model_mode
    selected_speaker = runtime.get_selected_speaker()

    existing_manifest = load_existing_manifest(manifest_path)
    entries = dict(existing_manifest.get("entries", {}))
    generated_count = 0
    reused_count = 0

    for index, card in enumerate(cards):
        existing_entry = entries.get(card.key, {})
        existing_path = str(existing_entry.get("path", "")).strip()
        if existing_path.startswith("/"):
            output_filename = Path(existing_path).name
        else:
            output_filename = build_filename(index, card)

        output_path = output_dir / output_filename
        public_path = f"/audio/cards/{output_filename}"
        existing_matches_runtime = (
            existing_entry.get("engine") == engine_name
            and existing_entry.get("modelId") == model_id
            and existing_entry.get("mode") == model_mode
            and existing_entry.get("speaker") == selected_speaker
        )

        if output_path.exists() and not args.force and existing_matches_runtime:
            reused_count += 1
            log(f"[{index + 1}/{len(cards)}] Reused {output_filename}")
        else:
            log(f"[{index + 1}/{len(cards)}] Generating {output_filename} from {card.hanzi} / {card.pinyin}")
            audio_bytes = runtime.synthesize_wav_bytes(
                build_generation_text(card),
                instruct=build_generation_instruct(card),
            )
            output_path.write_bytes(audio_bytes)
            generated_count += 1

        entries[card.key] = {
            "path": public_path,
            "hanzi": card.hanzi,
            "pinyin": card.pinyin,
            "translation": card.translation,
            "text": card.hanzi,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "engine": engine_name,
            "modelId": model_id,
            "mode": model_mode,
            "speaker": selected_speaker,
        }

    manifest = {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "engine": engine_name,
        "modelId": model_id,
        "mode": model_mode,
        "speaker": selected_speaker,
        "sourceFile": str(input_path),
        "entries": entries,
        "stats": {
            "inputCards": len(cards),
            "generated": generated_count,
            "reused": reused_count,
            "duplicates": len(duplicates),
            "invalidLines": len(invalid_lines),
        },
    }

    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Audio generation complete: {generated_count} generated, {reused_count} reused.", flush=True)
    if duplicates:
        print(f"Duplicates skipped: {len(duplicates)}", flush=True)
    if invalid_lines:
        print(f"Invalid lines skipped: {len(invalid_lines)}", flush=True)
    print(f"Manifest written to: {manifest_path}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nAudio generation interrupted by user.", flush=True)
