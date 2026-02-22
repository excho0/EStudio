from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.core.config import settings
from app.schemas.transcription import TranscriptionResponse
from app.services.backends import get_transcription_backend

router = APIRouter(prefix="/v1/transcriptions", tags=["transcriptions"])


@router.post("", response_model=TranscriptionResponse)
async def create_transcription(
    file: UploadFile = File(...),
    language: str | None = Form(default=None),
    diarize: bool = Form(default=False),
) -> TranscriptionResponse:
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

    backend = get_transcription_backend()
    return await backend.transcribe(
        audio_bytes=payload,
        filename=file.filename,
        language=language,
        diarize=diarize,
    )
