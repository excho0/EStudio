from __future__ import annotations

import asyncio
import tempfile
from abc import ABC, abstractmethod
from pathlib import Path
from threading import Lock
from typing import TYPE_CHECKING, cast

from app.core.config import settings
from app.schemas.transcription import CaptionToken, TranscriptionResponse

if TYPE_CHECKING:
    from whisperx.asr import FasterWhisperPipeline
    from whisperx.diarize import DiarizationPipeline
    from whisperx.schema import AlignedTranscriptionResult, SingleSegment, SingleWordSegment, TranscriptionResult


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


class WhisperXBackend(TranscriptionBackend):
    _model_lock = Lock()
    _align_lock = Lock()
    _diarize_lock = Lock()
    _transcribe_model: FasterWhisperPipeline | None = None
    _align_models: dict[str, tuple[object, object]] = {}
    _diarize_pipeline: DiarizationPipeline | None = None

    @classmethod
    def _get_transcribe_model(cls) -> FasterWhisperPipeline:
        import whisperx

        with cls._model_lock:
            if cls._transcribe_model is None:
                cls._transcribe_model = cast(
                    FasterWhisperPipeline,
                    whisperx.load_model(
                        settings.whisperx_model,
                        settings.whisperx_device,
                        compute_type=settings.whisperx_compute_type,
                    ),
                )
            return cls._transcribe_model

    @classmethod
    def _get_align_model(cls, language: str) -> tuple[object, object]:
        import whisperx

        with cls._align_lock:
            cached = cls._align_models.get(language)
            if cached is not None:
                return cached
            align_model, metadata = whisperx.load_align_model(
                language_code=language,
                device=settings.whisperx_device,
            )
            cls._align_models[language] = (align_model, metadata)
            return align_model, metadata

    @classmethod
    def _get_diarize_pipeline(cls) -> DiarizationPipeline:
        from whisperx.diarize import DiarizationPipeline

        with cls._diarize_lock:
            if cls._diarize_pipeline is None:
                cls._diarize_pipeline = DiarizationPipeline(
                    token=settings.hf_token,
                    device=settings.whisperx_device,
                )
            return cls._diarize_pipeline

    @staticmethod
    def _segment_to_caption(
        *,
        text: str,
        start_seconds: float | int | None,
        end_seconds: float | int | None,
    ) -> CaptionToken | None:
        normalized_text = (text or "").strip()
        if not normalized_text:
            return None

        start_ms = int(round(max(0.0, float(start_seconds or 0.0)) * 1000))
        end_ms = int(round(max(float(end_seconds or 0.0), float(start_seconds or 0.0)) * 1000))
        if end_ms <= start_ms:
            end_ms = start_ms + 1

        return CaptionToken(
            text=normalized_text,
            fromMs=start_ms,
            toMs=end_ms,
        )

    def _transcribe_sync(
        self,
        *,
        audio_bytes: bytes,
        filename: str,
        language: str | None,
        diarize: bool,
    ) -> TranscriptionResponse:
        import whisperx

        extension = Path(filename).suffix or ".wav"
        with tempfile.NamedTemporaryFile(suffix=extension, delete=True) as temp_file:
            temp_file.write(audio_bytes)
            temp_file.flush()

            audio = whisperx.load_audio(temp_file.name)
            model = self._get_transcribe_model()
            result = cast("TranscriptionResult", model.transcribe(
                audio,
                batch_size=settings.whisperx_batch_size,
                language=language or settings.whisperx_language,
            ))

            resolved_language = result.get("language") or language or settings.whisperx_language
            segments = cast(list[SingleSegment], result.get("segments") or [])

            if resolved_language:
                align_model, metadata = self._get_align_model(resolved_language)
                aligned = cast("AlignedTranscriptionResult", whisperx.align(
                    segments,
                    align_model,
                    metadata,
                    audio,
                    settings.whisperx_device,
                    return_char_alignments=False,
                ))
                segments = cast(list[SingleSegment], aligned.get("segments") or segments)

            if diarize:
                if not settings.hf_token:
                    raise ValueError("Diarization requires HF_TOKEN to be configured")
                diarize_pipeline = self._get_diarize_pipeline()
                diarize_segments = diarize_pipeline(audio)
                segments = cast(list[SingleSegment], whisperx.assign_word_speakers(
                    diarize_segments,
                    {"segments": segments},
                ).get("segments", segments))

            captions: list[CaptionToken] = []
            for segment in segments:
                words = cast(list[SingleWordSegment], segment.get("words") or [])
                if words:
                    for word in words:
                        caption = self._segment_to_caption(
                            text=word.get("word", ""),
                            start_seconds=word.get("start"),
                            end_seconds=word.get("end"),
                        )
                        if caption:
                            captions.append(caption)
                    continue

                caption = self._segment_to_caption(
                    text=segment.get("text", ""),
                    start_seconds=segment.get("start"),
                    end_seconds=segment.get("end"),
                )
                if caption:
                    captions.append(caption)

            duration_ms = max((caption.toMs for caption in captions), default=None)
            return TranscriptionResponse(
                backend="whisperx",
                language=resolved_language,
                captions=captions,
                durationMs=duration_ms,
            )

    async def transcribe(
        self,
        *,
        audio_bytes: bytes,
        filename: str,
        language: str | None,
        diarize: bool,
    ) -> TranscriptionResponse:
        return await asyncio.to_thread(
            self._transcribe_sync,
            audio_bytes=audio_bytes,
            filename=filename,
            language=language,
            diarize=diarize,
        )


def get_transcription_backend() -> TranscriptionBackend:
    backend = settings.captions_backend.strip().lower()
    if backend == "whisperx":
        return WhisperXBackend()
    raise ValueError(f"Unsupported captions backend: {backend}")
