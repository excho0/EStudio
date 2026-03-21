from __future__ import annotations

from app.core.config import settings
from app.services.backends.ace_step_whisperx_backend import AceStepWhisperXBackend
from app.services.backends.base import TranscriptionBackend
from app.services.backends.music_faster_whisper_backend import MusicFasterWhisperBackend
from app.services.backends.whisperx_backend import WhisperXBackend


def get_transcription_backend() -> TranscriptionBackend:
    backend = settings.captions_backend.strip().lower()
    if backend == "whisperx":
        return WhisperXBackend()
    if backend in {"ace-step", "ace-step-whisperx", "lyrics"}:
        return AceStepWhisperXBackend()
    if backend in {"music", "music-faster-whisper"}:
        return MusicFasterWhisperBackend()
    raise ValueError(f"Unsupported captions backend: {backend}")
