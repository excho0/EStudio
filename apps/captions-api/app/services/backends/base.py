from __future__ import annotations

from abc import ABC, abstractmethod

from app.schemas.transcription import TranscriptionResponse


class TranscriptionBackend(ABC):
    @abstractmethod
    async def transcribe(
        self,
        *,
        audio_bytes: bytes,
        filename: str,
        language: str | None,
        diarize: bool,
    ) -> TranscriptionResponse:
        raise NotImplementedError
