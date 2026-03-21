from __future__ import annotations

import asyncio
import tempfile
import time
from pathlib import Path
from threading import Lock
from typing import TYPE_CHECKING, Any, cast

from app.core.config import settings
from app.core.logging import get_logger
from app.schemas.transcription import CaptionToken, TranscriptionResponse
from app.services.backends.base import TranscriptionBackend
from app.services.backends.common import convert_to_wav_16k_mono, extract_vocals_with_demucs
from app.services.backends.music_faster_whisper_backend import MusicFasterWhisperBackend
from app.services.backends.whisperx_backend import WhisperXBackend

logger = get_logger("backend.ace-step-whisperx")

if TYPE_CHECKING:
    from transformers import Qwen2_5OmniProcessor, Qwen2_5OmniThinkerForConditionalGeneration
    from whisperx.schema import AlignedTranscriptionResult, SingleSegment, SingleWordSegment
else:
    Qwen2_5OmniProcessor = Any
    Qwen2_5OmniThinkerForConditionalGeneration = Any
    AlignedTranscriptionResult = Any
    SingleSegment = Any
    SingleWordSegment = Any


class AceStepWhisperXBackend(TranscriptionBackend):
    _model_lock = Lock()
    _model: Qwen2_5OmniThinkerForConditionalGeneration | None = None
    _processor: Qwen2_5OmniProcessor | None = None

    @classmethod
    def _get_model_and_processor(
        cls,
    ) -> tuple[Qwen2_5OmniThinkerForConditionalGeneration, Qwen2_5OmniProcessor]:
        with cls._model_lock:
            if cls._model is not None and cls._processor is not None:
                return cls._model, cls._processor

            try:
                from transformers import (
                    Qwen2_5OmniProcessor,
                    Qwen2_5OmniThinkerForConditionalGeneration,
                )
            except Exception as error:  # pragma: no cover - import depends on runtime image
                raise RuntimeError(
                    "ACE-Step backend requires transformers/Qwen2.5-Omni runtime dependencies. "
                    "Install captions-api with the whisperx extra in a CUDA-capable image."
                ) from error

            dtype = settings.ace_step_dtype.strip() or "auto"
            device_map = settings.ace_step_device_map.strip() or "auto"
            model = cast(
                Qwen2_5OmniThinkerForConditionalGeneration,
                Qwen2_5OmniThinkerForConditionalGeneration.from_pretrained(
                    settings.ace_step_model,
                    dtype=dtype,
                    device_map=device_map,
                ),
            )
            processor = cast(
                Qwen2_5OmniProcessor,
                Qwen2_5OmniProcessor.from_pretrained(settings.ace_step_model),
            )
            cls._model = model
            cls._processor = processor
            logger.info(
                "Loaded ACE-Step model. "
                f"model={settings.ace_step_model} device_map={device_map} dtype={dtype}"
            )
            return model, processor

    @staticmethod
    def _parse_ace_step_output(raw_text: str) -> tuple[str | None, list[str]]:
        lines = [line.strip() for line in raw_text.splitlines()]
        language: str | None = None
        lyric_lines: list[str] = []
        section: str | None = None

        for line in lines:
            if not line:
                continue
            lowered = line.lower()
            if lowered == "# languages":
                section = "language"
                continue
            if lowered == "# lyrics":
                section = "lyrics"
                continue
            if section == "language" and language is None:
                language = line.strip().lower() or None
                continue
            if section != "lyrics":
                continue
            if line.startswith("[") and line.endswith("]"):
                # Skip song-structure tags for caption text.
                continue
            lyric_lines.append(line)

        cleaned = []
        for line in lyric_lines:
            normalized = " ".join(line.split()).strip()
            if normalized:
                cleaned.append(normalized)
        return language, cleaned

    @staticmethod
    def _build_seed_segments(lines: list[str], duration_s: float) -> list[dict[str, object]]:
        if not lines:
            return []
        safe_duration_s = max(0.001, duration_s)
        weights = [max(1, len(line.replace(" ", ""))) for line in lines]
        total_weight = sum(weights)
        cursor = 0.0
        segments: list[dict[str, object]] = []
        for index, line in enumerate(lines):
            weight = weights[index]
            next_cursor = safe_duration_s if index == len(lines) - 1 else cursor + safe_duration_s * (
                weight / total_weight
            )
            if next_cursor <= cursor:
                next_cursor = cursor + 0.05
            segments.append(
                {
                    "start": cursor,
                    "end": next_cursor,
                    "text": line,
                }
            )
            cursor = next_cursor
        return segments

    @staticmethod
    def _segment_to_caption(word: object) -> CaptionToken | None:
        if isinstance(word, dict):
            text = str(word.get("word", "") or "").strip()
            start = float(word.get("start", 0.0) or 0.0)
            end = float(word.get("end", start) or start)
        else:
            text = str(getattr(word, "word", "") or "").strip()
            start = float(getattr(word, "start", 0.0) or 0.0)
            end = float(getattr(word, "end", start) or start)
        if not text:
            return None
        from_ms = int(round(max(0.0, start) * 1000))
        to_ms = int(round(max(end, start) * 1000))
        if to_ms <= from_ms:
            to_ms = from_ms + 1
        return CaptionToken(text=text, fromMs=from_ms, toMs=to_ms)

    def _transcribe_with_ace_step(self, audio_path: str) -> tuple[str | None, list[str]]:
        model, processor = self._get_model_and_processor()
        prompt = settings.ace_step_prompt.strip() or "*Task* Transcribe this audio in detail"
        conversation = [
            {
                "role": "user",
                "content": [
                    {"type": "audio", "path": audio_path},
                    {"type": "text", "text": prompt},
                ],
            }
        ]
        inputs = processor.apply_chat_template(
            conversation,
            add_generation_prompt=True,
            tokenize=True,
            return_dict=True,
            return_tensors="pt",
            padding=True,
        )
        device = getattr(model, "device", None) or getattr(getattr(model, "model", None), "device", None)
        if device is not None and hasattr(inputs, "to"):
            inputs = inputs.to(device)
        generated = model.generate(
            **inputs,
            max_new_tokens=settings.ace_step_max_new_tokens,
        )
        prompt_length = int(inputs["input_ids"].shape[-1])
        generated_only = generated[:, prompt_length:]
        decoded = processor.batch_decode(
            generated_only,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False,
        )
        raw_text = decoded[0] if decoded else ""
        language, lyric_lines = self._parse_ace_step_output(raw_text)
        if not lyric_lines:
            raise RuntimeError("ACE-Step returned no lyric lines to align.")
        return language, lyric_lines

    def _align_lyrics_with_whisperx(
        self,
        *,
        audio_path: str,
        language: str | None,
        lyric_lines: list[str],
    ) -> TranscriptionResponse:
        import soundfile as sf
        import whisperx

        info = sf.info(audio_path)
        duration_s = float(info.duration or 0.0)
        seed_segments = self._build_seed_segments(lyric_lines, duration_s)
        if not seed_segments:
            raise RuntimeError("No seed lyric segments were built for alignment.")

        audio = whisperx.load_audio(audio_path)
        resolved_language = language or settings.whisperx_language or settings.music_whisper_language
        if not resolved_language:
            raise RuntimeError("ACE-Step alignment requires a resolved language code.")

        align_model, metadata = WhisperXBackend._get_align_model(resolved_language)
        aligned = cast(
            AlignedTranscriptionResult,
            whisperx.align(
                cast(list[SingleSegment], seed_segments),
                align_model,
                metadata,
                audio,
                settings.whisperx_device,
                interpolate_method="linear",
                return_char_alignments=False,
            ),
        )
        segments = cast(list[SingleSegment], aligned.get("segments") or seed_segments)

        captions: list[CaptionToken] = []
        for segment in segments:
            words = cast(list[SingleWordSegment], segment.get("words") or [])
            for word in words:
                caption = self._segment_to_caption(word)
                if caption:
                    captions.append(caption)

        if not captions:
            raise RuntimeError("ACE-Step alignment produced no word-level captions.")

        duration_ms = max((caption.toMs for caption in captions), default=None)
        return TranscriptionResponse(
            backend="ace-step-whisperx",
            language=resolved_language,
            captions=captions,
            durationMs=duration_ms,
        )

    def _resolve_fallback_backend(self) -> TranscriptionBackend:
        fallback = settings.ace_step_fallback_backend.strip().lower()
        if fallback in {"music", "music-faster-whisper"}:
            return MusicFasterWhisperBackend()
        if fallback == "whisperx":
            return WhisperXBackend()
        raise RuntimeError(f"Unsupported ACE-Step fallback backend: {settings.ace_step_fallback_backend}")

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

            try:
                lyric_language, lyric_lines = self._transcribe_with_ace_step(transcription_input_path)
                response = self._align_lyrics_with_whisperx(
                    audio_path=transcription_input_path,
                    language=language or lyric_language,
                    lyric_lines=lyric_lines,
                )
                logger.info(
                    "ACE-Step WhisperX transcription completed. "
                    f"filename={filename} captions_count={len(response.captions)} "
                    f"duration_ms={response.durationMs} "
                    f"elapsed_ms={int(round((time.perf_counter() - started) * 1000))}"
                )
                return response
            except Exception as error:
                logger.warning(
                    "ACE-Step backend failed; falling back to configured backend. "
                    f"error={error} fallback={settings.ace_step_fallback_backend}"
                )
                fallback_backend = self._resolve_fallback_backend()
                if isinstance(fallback_backend, MusicFasterWhisperBackend):
                    return fallback_backend._transcribe_sync(
                        audio_bytes=audio_bytes,
                        filename=filename,
                        language=language,
                        diarize=False,
                    )
                if isinstance(fallback_backend, WhisperXBackend):
                    return fallback_backend._transcribe_sync(
                        audio_bytes=audio_bytes,
                        filename=filename,
                        language=language,
                        diarize=False,
                    )
                raise RuntimeError("Unsupported fallback backend implementation.")

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
