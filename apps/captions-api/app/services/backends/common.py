from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger("backend.audio")


def convert_to_wav_16k_mono(input_path: str, output_path: str) -> None:
    command = [
        "ffmpeg",
        "-y",
        "-i",
        input_path,
        "-ac",
        "1",
        "-ar",
        "16000",
        "-vn",
        output_path,
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
            "Failed to convert audio to 16k wav with ffmpeg. "
            f"exit={completed.returncode} stderr={stderr or 'unknown error'}"
        )


def extract_vocals_with_demucs(input_wav_path: str, output_vocals_path: str) -> None:
    input_path = Path(input_wav_path).resolve()
    output_path = Path(output_vocals_path).resolve()
    logger.info(
        "Starting Demucs vocal separation. "
        f"model={settings.captions_demucs_model} input={input_path}"
    )
    with tempfile.TemporaryDirectory(prefix="demucs-out-") as demucs_out_dir:
        command = [
            "demucs",
            "--two-stems=vocals",
            "--mp3",
            "-n",
            settings.captions_demucs_model,
            "--out",
            demucs_out_dir,
            str(input_path),
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
                "Demucs vocal separation failed. "
                f"exit={completed.returncode} stderr={stderr or 'unknown error'}"
            )

        stem_name = input_path.stem
        vocals_file = (
            Path(demucs_out_dir) / settings.captions_demucs_model / stem_name / "vocals.mp3"
        )
        if not vocals_file.is_file():
            raise RuntimeError(f"Demucs completed but vocals stem not found at: {vocals_file}")

        convert_to_wav_16k_mono(str(vocals_file), str(output_path))
        logger.info(f"Demucs vocal separation completed. output={output_path}")
