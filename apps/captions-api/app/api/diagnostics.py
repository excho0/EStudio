from __future__ import annotations

import io
import math
import platform
import struct
import time
import wave

from fastapi import APIRouter

from app.core.config import settings
from app.schemas.diagnostics import (
    ProbeStatus,
    RuntimeDiagnosticsResponse,
    TranscriptionSmokeResponse,
)
from app.services.backends import get_transcription_backend

router = APIRouter(prefix="/v1/diagnostics", tags=["diagnostics"])


@router.get("/runtime", response_model=RuntimeDiagnosticsResponse)
async def get_runtime_diagnostics() -> RuntimeDiagnosticsResponse:
    checks: dict[str, ProbeStatus] = {}

    torch_module = None
    torch_version: str | None = None
    whisperx_version: str | None = None
    cuda_available = False
    cuda_device_count = 0
    cuda_device_name: str | None = None
    selected_backend_class: str | None = None

    try:
        backend = get_transcription_backend()
        selected_backend_class = backend.__class__.__name__
        checks["backend_selection"] = ProbeStatus(ok=True)
    except Exception as error:
        checks["backend_selection"] = ProbeStatus(ok=False, error=str(error))

    try:
        import torch

        torch_module = torch
        torch_version = torch.__version__
        checks["torch_import"] = ProbeStatus(ok=True)
    except Exception as error:
        checks["torch_import"] = ProbeStatus(ok=False, error=str(error))

    try:
        import whisperx

        whisperx_version = getattr(whisperx, "__version__", "unknown")
        checks["whisperx_import"] = ProbeStatus(ok=True)
    except Exception as error:
        checks["whisperx_import"] = ProbeStatus(ok=False, error=str(error))

    if torch_module is not None:
        try:
            cuda_available = bool(torch_module.cuda.is_available())
            cuda_device_count = int(torch_module.cuda.device_count())
            if cuda_available and cuda_device_count > 0:
                cuda_device_name = str(torch_module.cuda.get_device_name(0))
            checks["cuda_probe"] = ProbeStatus(ok=True)
        except Exception as error:
            checks["cuda_probe"] = ProbeStatus(ok=False, error=str(error))
    else:
        checks["cuda_probe"] = ProbeStatus(ok=False, error="torch not available")

    return RuntimeDiagnosticsResponse(
        service="captions-api",
        env=settings.app_env,
        configuredBackend=settings.captions_backend,
        selectedBackendClass=selected_backend_class,
        pythonVersion=platform.python_version(),
        torchVersion=torch_version,
        whisperxVersion=whisperx_version,
        cudaAvailable=cuda_available,
        cudaDeviceCount=cuda_device_count,
        cudaDeviceName=cuda_device_name,
        checks=checks,
    )


def _build_smoke_wav(duration_ms: int = 1200, sample_rate: int = 16000) -> bytes:
    frame_count = max(1, int(sample_rate * (duration_ms / 1000)))
    amplitude = 0.2
    frequency_hz = 440.0
    frames = bytearray()
    for index in range(frame_count):
        sample = amplitude * math.sin(2.0 * math.pi * frequency_hz * (index / sample_rate))
        sample_i16 = int(max(-1.0, min(1.0, sample)) * 32767)
        frames.extend(struct.pack("<h", sample_i16))

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(bytes(frames))
    return buffer.getvalue()


@router.get("/transcription-smoke", response_model=TranscriptionSmokeResponse)
async def run_transcription_smoke() -> TranscriptionSmokeResponse:
    backend = get_transcription_backend()
    started_at = time.perf_counter()
    duration_ms = 1200
    try:
        response = await backend.transcribe(
            audio_bytes=_build_smoke_wav(duration_ms=duration_ms),
            filename="diagnostic-smoke.wav",
            language=settings.whisperx_language or "en",
            diarize=False,
        )
        elapsed_ms = int(round((time.perf_counter() - started_at) * 1000))
        return TranscriptionSmokeResponse(
            service="captions-api",
            backend=settings.captions_backend,
            ok=True,
            elapsedMs=elapsed_ms,
            generatedAudioMs=duration_ms,
            captionsCount=len(response.captions),
            language=response.language,
        )
    except Exception as error:
        elapsed_ms = int(round((time.perf_counter() - started_at) * 1000))
        return TranscriptionSmokeResponse(
            service="captions-api",
            backend=settings.captions_backend,
            ok=False,
            elapsedMs=elapsed_ms,
            generatedAudioMs=duration_ms,
            captionsCount=0,
            error=str(error),
        )
