import warnings

from fastapi import FastAPI

from app.api.diagnostics import router as diagnostics_router
from app.api.transcriptions import router as transcriptions_router
from app.core.config import settings

app = FastAPI(
    title="EStudio Captions API",
    version="0.1.0",
    description="Stateless transcription service for caption generation backends.",
)

# pyannote may emit torchcodec ABI warnings even when WhisperX works end-to-end.
warnings.filterwarnings(
    "ignore",
    message=r".*torchcodec is not installed correctly so built-in audio decoding will fail.*",
    category=UserWarning,
)


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "captions-api",
        "env": settings.app_env,
        "backend": settings.captions_backend,
    }


app.include_router(transcriptions_router)
app.include_router(diagnostics_router)
