from __future__ import annotations

import asyncio
import tempfile
import time
from pathlib import Path
from threading import Lock
from types import SimpleNamespace
from typing import TYPE_CHECKING, cast

from app.core.config import settings
from app.core.logging import get_logger
from app.schemas.transcription import CaptionToken, TranscriptionResponse
from app.services.backends.base import TranscriptionBackend
from app.services.backends.common import convert_to_wav_16k_mono, extract_vocals_with_demucs

logger = get_logger("backend.whisperx")

if TYPE_CHECKING:
    from whisperx.asr import FasterWhisperPipeline
    from whisperx.diarize import DiarizationPipeline
    from whisperx.schema import (
        AlignedTranscriptionResult,
        SingleSegment,
        SingleWordSegment,
        TranscriptionResult,
    )


class WhisperXBackend(TranscriptionBackend):
    _model_lock = Lock()
    _align_lock = Lock()
    _diarize_lock = Lock()
    _transcribe_models: dict[tuple[str | None, str], FasterWhisperPipeline] = {}
    _align_models: dict[str, tuple[object, object]] = {}
    _diarize_pipeline: DiarizationPipeline | None = None

    @staticmethod
    def _resolve_vad_method() -> str:
        value = (settings.whisperx_vad_method or "").strip().lower()
        if value in {"silero", "pyannote", "none"}:
            return value
        return "silero"

    @classmethod
    def _get_transcribe_model(cls, preferred_language: str | None = None) -> FasterWhisperPipeline:
        import whisperx
        from whisperx.vads.vad import Vad

        with cls._model_lock:
            language = preferred_language or settings.whisperx_language
            vad_method = cls._resolve_vad_method()
            cache_key = (language, vad_method)
            cached = cls._transcribe_models.get(cache_key)
            if cached is not None:
                logger.debug(f"Reusing cached WhisperX model. cache_key={cache_key}")
                return cached

            vad_model: object | None = None
            load_vad_method: str | None = vad_method
            if vad_method == "none":
                class FullAudioVad(Vad):
                    def __init__(self, chunk_seconds: float = 30.0) -> None:
                        self.chunk_seconds = max(1.0, float(chunk_seconds))

                    def __call__(self, audio: dict[str, object], **_: object) -> list[SimpleNamespace]:
                        sample_rate = int(audio["sample_rate"])  # type: ignore[index]
                        waveform = audio["waveform"]  # type: ignore[index]
                        samples = int(getattr(waveform, "shape")[-1])
                        duration = max(0.001, float(samples) / float(sample_rate))
                        segments: list[SimpleNamespace] = []
                        start = 0.0
                        while start < duration:
                            end = min(duration, start + self.chunk_seconds)
                            segments.append(SimpleNamespace(start=start, end=end, speaker="UNKNOWN"))
                            start = end
                        return segments

                    @staticmethod
                    def preprocess_audio(audio: object) -> object:
                        return audio

                    @staticmethod
                    def merge_chunks(
                        segments_list: list[SimpleNamespace],
                        chunk_size: int,
                        onset: float = 0.5,
                        offset: float | None = None,
                    ) -> list[dict[str, object]]:
                        del chunk_size, onset, offset
                        merged: list[dict[str, object]] = []
                        for segment in segments_list:
                            start = float(segment.start)
                            end = float(segment.end)
                            if end <= start:
                                continue
                            merged.append({"start": start, "end": end, "segments": [(start, end)]})
                        return merged

                vad_model = FullAudioVad(chunk_seconds=30.0)
                load_vad_method = "silero"

            model = cast(
                "FasterWhisperPipeline",
                whisperx.load_model(
                    settings.whisperx_model,
                    settings.whisperx_device,
                    compute_type=settings.whisperx_compute_type,
                    language=language,
                    vad_method=load_vad_method,
                    vad_model=cast("object", vad_model),
                    download_root=settings.whisperx_cache_dir,
                ),
            )
            cls._transcribe_models[cache_key] = model
            logger.info(
                "Loaded WhisperX model. "
                f"language={language} vad_method={vad_method} "
                f"model={settings.whisperx_model} device={settings.whisperx_device} "
                f"compute_type={settings.whisperx_compute_type}"
            )
            return model

    @classmethod
    def _get_align_model(cls, language: str) -> tuple[object, object]:
        import whisperx

        with cls._align_lock:
            cached = cls._align_models.get(language)
            if cached is not None:
                logger.debug(f"Reusing cached align model. language={language}")
                return cached
            align_model, metadata = whisperx.load_align_model(
                language_code=language,
                device=settings.whisperx_device,
            )
            cls._align_models[language] = (align_model, metadata)
            logger.info(f"Loaded align model. language={language} device={settings.whisperx_device}")
            return align_model, metadata

    @classmethod
    def _get_diarize_pipeline(cls) -> DiarizationPipeline:
        from whisperx.diarize import DiarizationPipeline

        with cls._diarize_lock:
            if cls._diarize_pipeline is None:
                cls._diarize_pipeline = DiarizationPipeline(
                    model_name=settings.whisperx_diarization_model,
                    token=settings.hf_token,
                    device=settings.whisperx_device,
                    cache_dir=settings.whisperx_cache_dir,
                )
            return cls._diarize_pipeline

    @staticmethod
    def _segment_to_caption(*, text: str, start_seconds: float | int | None, end_seconds: float | int | None) -> CaptionToken | None:
        normalized_text = (text or "").strip()
        if not normalized_text:
            return None

        start_ms = int(round(max(0.0, float(start_seconds or 0.0)) * 1000))
        end_ms = int(round(max(float(end_seconds or 0.0), float(start_seconds or 0.0)) * 1000))
        if end_ms <= start_ms:
            end_ms = start_ms + 1
        return CaptionToken(text=normalized_text, fromMs=start_ms, toMs=end_ms)

    @staticmethod
    def _segment_text_to_uniform_word_captions(
        *, text: str, start_seconds: float | int | None, end_seconds: float | int | None
    ) -> list[CaptionToken]:
        normalized = (text or "").strip()
        if not normalized:
            return []
        words = [w for w in normalized.split() if w.strip()]
        if not words:
            return []

        start_ms = int(round(max(0.0, float(start_seconds or 0.0)) * 1000))
        end_ms = int(round(max(float(end_seconds or 0.0), float(start_seconds or 0.0)) * 1000))
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
            out.append(CaptionToken(text=word, fromMs=word_start, toMs=min(end_ms, word_end)))
        return out

    def _transcribe_sync(
        self,
        *,
        audio_bytes: bytes,
        filename: str,
        language: str | None,
        diarize: bool,
    ) -> TranscriptionResponse:
        import torch
        import whisperx

        started_at = time.perf_counter()
        logger.info(
            "WhisperX transcription started. "
            f"filename={filename} input_size_bytes={len(audio_bytes)} "
            f"language_hint={language} diarize={diarize} "
            f"vad_method={self._resolve_vad_method()} "
            f"vocal_separation={settings.captions_use_vocal_separation}"
        )

        if settings.whisperx_tf32:
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True

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

            audio = whisperx.load_audio(transcription_input_path)
            model = self._get_transcribe_model(language)
            asr_started = time.perf_counter()
            result = cast(
                "TranscriptionResult",
                model.transcribe(
                    audio,
                    batch_size=settings.whisperx_batch_size,
                    language=language or settings.whisperx_language,
                ),
            )
            logger.info(
                "WhisperX ASR stage completed. "
                f"elapsed_ms={int(round((time.perf_counter() - asr_started) * 1000))} "
                f"segments={len(cast('list[SingleSegment]', result.get('segments') or []))}"
            )

            resolved_language = result.get("language") or language or settings.whisperx_language
            segments = cast("list[SingleSegment]", result.get("segments") or [])

            if resolved_language:
                align_model, metadata = self._get_align_model(resolved_language)
                align_started = time.perf_counter()
                aligned = cast(
                    "AlignedTranscriptionResult",
                    whisperx.align(
                        segments,
                        align_model,
                        metadata,
                        audio,
                        settings.whisperx_device,
                        interpolate_method="linear",
                        return_char_alignments=False,
                    ),
                )
                segments = cast("list[SingleSegment]", aligned.get("segments") or segments)
                logger.info(
                    "WhisperX alignment stage completed. "
                    f"language={resolved_language} "
                    f"elapsed_ms={int(round((time.perf_counter() - align_started) * 1000))} "
                    f"segments={len(segments)}"
                )

            if diarize:
                if not settings.hf_token:
                    raise ValueError("Diarization requires HF_TOKEN to be configured")
                diarize_pipeline = self._get_diarize_pipeline()
                diarize_segments = diarize_pipeline(audio)
                segments = cast(
                    "list[SingleSegment]",
                    whisperx.assign_word_speakers(diarize_segments, {"segments": segments}).get(
                        "segments", segments
                    ),
                )

            captions: list[CaptionToken] = []
            for segment in segments:
                words = cast("list[SingleWordSegment]", segment.get("words") or [])
                if words:
                    added_words = 0
                    for word in words:
                        caption = self._segment_to_caption(
                            text=word.get("word", ""),
                            start_seconds=word.get("start"),
                            end_seconds=word.get("end"),
                        )
                        if caption:
                            captions.append(caption)
                            added_words += 1
                    if added_words > 0:
                        continue

                uniform_word_captions = self._segment_text_to_uniform_word_captions(
                    text=segment.get("text", ""),
                    start_seconds=segment.get("start"),
                    end_seconds=segment.get("end"),
                )
                if uniform_word_captions:
                    captions.extend(uniform_word_captions)
                    continue

                caption = self._segment_to_caption(
                    text=segment.get("text", ""),
                    start_seconds=segment.get("start"),
                    end_seconds=segment.get("end"),
                )
                if caption:
                    captions.append(caption)

            duration_ms = max((caption.toMs for caption in captions), default=None)
            response = TranscriptionResponse(
                backend="whisperx",
                language=resolved_language,
                captions=captions,
                durationMs=duration_ms,
            )
            logger.info(
                "WhisperX transcription completed. "
                f"filename={filename} captions_count={len(captions)} "
                f"duration_ms={duration_ms} "
                f"elapsed_ms={int(round((time.perf_counter() - started_at) * 1000))}"
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
