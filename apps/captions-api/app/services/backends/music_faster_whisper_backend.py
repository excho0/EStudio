from __future__ import annotations

import asyncio
import tempfile
import time
from pathlib import Path
from threading import Lock
from typing import TYPE_CHECKING, Any, Iterable, Literal, TypedDict, cast

from app.core.config import settings
from app.core.logging import get_logger
from app.schemas.transcription import CaptionToken, TranscriptionResponse
from app.services.backends.base import TranscriptionBackend
from app.services.backends.common import convert_to_wav_16k_mono, extract_vocals_with_demucs

logger = get_logger("backend.music")

if TYPE_CHECKING:
    from faster_whisper import WhisperModel as FasterWhisperModel
    from faster_whisper.transcribe import Segment as FasterWhisperSegment
    from faster_whisper.transcribe import TranscriptionInfo as FasterWhisperInfo
    from faster_whisper.transcribe import Word as FasterWhisperWord
else:
    FasterWhisperModel = Any
    FasterWhisperSegment = Any
    FasterWhisperInfo = Any
    FasterWhisperWord = Any


class DecodeOptions(TypedDict):
    beam_size: int
    best_of: int
    condition_on_previous_text: bool
    vad_filter: bool
    word_timestamps: bool
    temperature: float


class MusicFasterWhisperBackend(TranscriptionBackend):
    _model_lock = Lock()
    _models: dict[tuple[str, str, str], FasterWhisperModel] = {}

    @staticmethod
    def _resolve_profile() -> Literal["default", "parity"]:
        raw = settings.music_whisper_profile.strip().lower()
        if raw == "parity":
            return "parity"
        return "default"

    @classmethod
    def _resolve_compute_type(cls) -> str:
        if cls._resolve_profile() == "parity":
            return settings.music_whisper_parity_compute_type
        return settings.music_whisper_compute_type

    @classmethod
    def _resolve_decode_options(cls) -> DecodeOptions:
        if cls._resolve_profile() == "parity":
            return {
                "beam_size": settings.music_whisper_parity_beam_size,
                "best_of": settings.music_whisper_parity_best_of,
                "condition_on_previous_text": False,
                "vad_filter": False,
                "word_timestamps": True,
                "temperature": 0,
            }
        return {
            "beam_size": settings.music_whisper_beam_size,
            "best_of": settings.music_whisper_best_of,
            "condition_on_previous_text": False,
            "vad_filter": False,
            "word_timestamps": True,
            "temperature": 0,
        }

    @classmethod
    def _get_model(cls) -> FasterWhisperModel:
        from faster_whisper import WhisperModel

        with cls._model_lock:
            compute_type = cls._resolve_compute_type()
            key = (
                settings.music_whisper_model,
                settings.music_whisper_device,
                compute_type,
            )
            cached = cls._models.get(key)
            if cached is None:
                cached = cast(
                    FasterWhisperModel,
                    WhisperModel(
                        settings.music_whisper_model,
                        device=settings.music_whisper_device,
                        compute_type=compute_type,
                        download_root=settings.whisperx_cache_dir,
                    ),
                )
                cls._models[key] = cached
                logger.info(
                    "Loaded music faster-whisper model. "
                    f"model={settings.music_whisper_model} device={settings.music_whisper_device} "
                    f"compute_type={compute_type} profile={cls._resolve_profile()}"
                )
            return cached

    @staticmethod
    def _segment_text_to_uniform_word_captions(text: str, start_sec: float, end_sec: float) -> list[CaptionToken]:
        normalized = (text or "").strip()
        if not normalized:
            return []
        words = [w for w in normalized.split() if w.strip()]
        if not words:
            return []

        start_ms = int(round(max(0.0, start_sec) * 1000))
        end_ms = int(round(max(end_sec, start_sec) * 1000))
        if end_ms <= start_ms:
            end_ms = start_ms + 1

        total = len(words)
        span = max(1, end_ms - start_ms)
        out: list[CaptionToken] = []
        for idx, word in enumerate(words):
            word_start = start_ms + int(round((idx / total) * span))
            word_end = start_ms + int(round(((idx + 1) / total) * span))
            if word_end <= word_start:
                word_end = word_start + 1
            out.append(
                CaptionToken(
                    text=word,
                    fromMs=word_start,
                    toMs=min(end_ms, word_end),
                )
            )
        return out

    def _transcribe_sync(
        self,
        *,
        audio_bytes: bytes,
        filename: str,
        language: str | None,
        diarize: bool,
    ) -> TranscriptionResponse:
        del diarize
        started = time.perf_counter()
        logger.info(
            "Music backend transcription started. "
            f"filename={filename} input_size_bytes={len(audio_bytes)} language_hint={language} "
            f"vocal_separation={settings.captions_use_vocal_separation}"
        )

        extension = Path(filename).suffix or ".wav"
        with tempfile.NamedTemporaryFile(suffix=extension, delete=True) as source_file, tempfile.NamedTemporaryFile(
            suffix=".wav", delete=True
        ) as normalized_wav_file, tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as vocals_wav_file:
            source_file.write(audio_bytes)
            source_file.flush()
            convert_to_wav_16k_mono(source_file.name, normalized_wav_file.name)

            transcription_input_path = normalized_wav_file.name
            if settings.captions_use_vocal_separation:
                try:
                    extract_vocals_with_demucs(normalized_wav_file.name, vocals_wav_file.name)
                except Exception as error:
                    logger.warning(
                        "Demucs vocal separation failed; using normalized original audio. "
                        f"error={error}"
                    )
                    if settings.captions_vocal_separation_required:
                        raise
                else:
                    transcription_input_path = vocals_wav_file.name

            model = self._get_model()
            decode_options = self._resolve_decode_options()
            asr_started = time.perf_counter()
            segments_iter, info = cast(
                tuple[Iterable[FasterWhisperSegment], FasterWhisperInfo],
                model.transcribe(
                    transcription_input_path,
                    language=language or settings.music_whisper_language,
                    beam_size=decode_options["beam_size"],
                    best_of=decode_options["best_of"],
                    condition_on_previous_text=decode_options["condition_on_previous_text"],
                    vad_filter=decode_options["vad_filter"],
                    word_timestamps=decode_options["word_timestamps"],
                    temperature=decode_options["temperature"],
                ),
            )
            logger.info(
                "Music faster-whisper ASR stage completed. "
                f"elapsed_ms={int(round((time.perf_counter() - asr_started) * 1000))} "
                f"detected_language={getattr(info, 'language', None)} "
                f"profile={self._resolve_profile()} beam_size={decode_options['beam_size']} "
                f"best_of={decode_options['best_of']} compute_type={self._resolve_compute_type()}"
            )

            captions: list[CaptionToken] = []
            for segment in segments_iter:
                start_sec = float(getattr(segment, "start", 0.0) or 0.0)
                end_sec = float(getattr(segment, "end", start_sec) or start_sec)

                words = cast(list[FasterWhisperWord], getattr(segment, "words", None) or [])
                added_words = 0
                for word in words:
                    text = str(getattr(word, "word", "") or "").strip()
                    if not text:
                        continue
                    w_start = float(getattr(word, "start", start_sec) or start_sec)
                    w_end = float(getattr(word, "end", w_start) or w_start)
                    from_ms = int(round(max(0.0, w_start) * 1000))
                    to_ms = int(round(max(w_end, w_start) * 1000))
                    if to_ms <= from_ms:
                        to_ms = from_ms + 1
                    captions.append(CaptionToken(text=text, fromMs=from_ms, toMs=to_ms))
                    added_words += 1

                if added_words > 0:
                    continue

                text = str(getattr(segment, "text", "") or "")
                captions.extend(self._segment_text_to_uniform_word_captions(text, start_sec, end_sec))

            duration_ms = max((c.toMs for c in captions), default=None)
            response = TranscriptionResponse(
                backend="music-faster-whisper",
                language=getattr(info, "language", None) or language or settings.music_whisper_language,
                captions=captions,
                durationMs=duration_ms,
            )
            logger.info(
                "Music backend transcription completed. "
                f"filename={filename} captions_count={len(captions)} duration_ms={duration_ms} "
                f"elapsed_ms={int(round((time.perf_counter() - started) * 1000))}"
            )
            return response

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
