from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from qwen_tts_runtime import REPO_ROOT, QwenTTSRuntime


PUNCTUATION_PATTERN = re.compile(r"""[.,!?;:()\[\]{}\"'`]""")
WHITESPACE_PATTERN = re.compile(r"\s+")
BREAK_PATTERN = re.compile(r"<br\s*/?>", re.IGNORECASE)
ASCII_SLUG_PATTERN = re.compile(r"[^a-z0-9]+")


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
        "Please read the Chinese text in standard Mandarin. "
        "Speak only the Chinese text itself and do not read any explanation or pinyin aloud. "
        f"Reading hint: {card.pinyin}."
    )


def build_generation_text(card: ParsedCard) -> str:
    if card.hanzi.endswith(("\u3002", "\uff01", "\uff1f", ".", "!", "?")):
        return card.hanzi
    return f"{card.hanzi}\u3002"


def load_existing_manifest(path: Path) -> dict:
    if not path.exists():
        return {"version": 1, "entries": {}}

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"version": 1, "entries": {}}


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate pre-rendered audio files and manifest for Hanzi Flow cards."
    )
    parser.add_argument(
        "--input",
        required=True,
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
        "--limit",
        type=int,
        default=0,
        help="Optional number of cards to generate for a quick test.",
    )
    return parser.parse_args()


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

    runtime = QwenTTSRuntime()
    runtime.load_model()

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

        if output_path.exists() and not args.force:
            reused_count += 1
        else:
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
            "engine": "qwen3-tts-local",
            "modelId": runtime.settings.model_id,
            "mode": runtime.model_mode,
            "speaker": runtime.get_selected_speaker() if runtime.model_mode == "custom_voice" else None,
        }

    manifest = {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "engine": "qwen3-tts-local",
        "modelId": runtime.settings.model_id,
        "mode": runtime.model_mode,
        "speaker": runtime.get_selected_speaker() if runtime.model_mode == "custom_voice" else None,
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
    main()
