import time
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.core.config import settings
from app.core.logging import get_logger
from app.core.security import require_api_token
from app.schemas.transcription import TranscriptionResponse
from app.services.backends import get_transcription_backend

logger = get_logger("api.transcriptions")

router = APIRouter(
    prefix="/v1/transcriptions",
    tags=["transcriptions"],
    dependencies=[Depends(require_api_token)],
)


@router.post("", response_model=TranscriptionResponse)
async def create_transcription(
    file: UploadFile = File(...),
    language: str | None = Form(default=None),
    diarize: bool = Form(default=False),
) -> TranscriptionResponse:
    request_id = uuid4().hex[:8]
    started_at = time.perf_counter()
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    max_upload_bytes = settings.transcription_max_upload_mb * 1024 * 1024
    if len(payload) > max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Uploaded file exceeds TRANSCRIPTION_MAX_UPLOAD_MB={settings.transcription_max_upload_mb}MB"
            ),
        )

    logger.info(
        "Transcription request accepted. "
        f"request_id={request_id} filename={file.filename} size_bytes={len(payload)} "
        f"language={language} diarize={diarize}"
    )

    backend = get_transcription_backend()
    result = await backend.transcribe(
        audio_bytes=payload,
        filename=file.filename,
        language=language,
        diarize=diarize,
    )
    elapsed_ms = int(round((time.perf_counter() - started_at) * 1000))
    logger.info(
        "Transcription request completed. "
        f"request_id={request_id} filename={file.filename} captions_count={len(result.captions)} "
        f"language={result.language} duration_ms={result.durationMs} elapsed_ms={elapsed_ms}"
    )
    return result
