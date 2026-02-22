from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
import time
from pathlib import Path

CURRENT_FILE = Path(__file__).resolve()
CAPTIONS_API_ROOT = CURRENT_FILE.parent.parent
if str(CAPTIONS_API_ROOT) not in sys.path:
    sys.path.insert(0, str(CAPTIONS_API_ROOT))

def convert_to_wav_16k_mono(input_path: Path, output_path: Path) -> None:
    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(input_path),
        "-ac",
        "1",
        "-ar",
        "16000",
        "-vn",
        str(output_path),
    ]
    completed = subprocess.run(
        command,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if completed.returncode != 0:
        stderr = (completed.stderr or "").strip()
        raise RuntimeError(
            "ffmpeg conversion failed. "
            f"exit={completed.returncode} stderr={stderr or 'unknown error'}"
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run captions-api transcription backend on a real local file."
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Absolute or relative path to input audio/video file.",
    )
    parser.add_argument(
        "--language",
        default=None,
        help="Language hint (example: en, ar). Optional.",
    )
    parser.add_argument(
        "--diarize",
        action="store_true",
        help="Enable diarization for this run.",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Optional output JSON path. Defaults to tests/.tmp/<name>.captions.json",
    )
    parser.add_argument(
        "--no-convert",
        action="store_true",
        help="Skip conversion and pass original bytes directly.",
    )
    parser.add_argument(
        "--vad-method",
        choices=["silero", "pyannote", "none"],
        default=None,
        help="Override WHISPERX_VAD_METHOD for this test run.",
    )
    return parser.parse_args()


async def main() -> int:
    args = parse_args()
    if args.vad_method:
        os.environ["WHISPERX_VAD_METHOD"] = args.vad_method

    # Import after env overrides so settings picks up test-specific values.
    from app.core.config import settings
    from app.services.backends import get_transcription_backend

    input_path = Path(args.input).expanduser().resolve()
    if not input_path.exists() or not input_path.is_file():
        raise FileNotFoundError(f"Input file does not exist: {input_path}")

    converted_path: Path | None = None
    if args.no_convert:
        audio_bytes = input_path.read_bytes()
    else:
        converted_path = input_path.parent / ".tmp" / f"{input_path.stem}.16k.wav"
        converted_path.parent.mkdir(parents=True, exist_ok=True)
        convert_to_wav_16k_mono(input_path, converted_path)
        audio_bytes = converted_path.read_bytes()

    backend = get_transcription_backend()

    started = time.perf_counter()
    result = await backend.transcribe(
        audio_bytes=audio_bytes,
        filename=input_path.name,
        language=args.language,
        diarize=bool(args.diarize),
    )
    elapsed_ms = int(round((time.perf_counter() - started) * 1000))

    output_path = (
        Path(args.output).expanduser().resolve()
        if args.output
        else input_path.parent / ".tmp" / f"{input_path.stem}.captions.json"
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)

    payload = result.model_dump()
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    segments = payload.get("captions", [])
    print(f"Backend: {payload.get('backend')}")
    print(f"VAD method: {settings.whisperx_vad_method}")
    print(f"Language: {payload.get('language')}")
    print(f"Segments: {len(segments)}")
    print(f"Elapsed: {elapsed_ms}ms")
    print(f"Output: {output_path}")
    if converted_path is not None:
        print(f"Normalized audio: {converted_path}")

    if segments:
        first = segments[0]
        last = segments[-1]
        print(
            "Range: "
            f"{first.get('fromMs', 0)}ms -> {last.get('toMs', 0)}ms "
            f"(duration ~= {max(0, int(last.get('toMs', 0)) - int(first.get('fromMs', 0)))}ms)"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
