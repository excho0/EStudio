import warnings
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.diagnostics import router as diagnostics_router
from app.api.transcriptions import router as transcriptions_router
from app.core.config import settings
from app.core.logging import get_logger, suppress_healthcheck_access_logs

logger = get_logger("runtime")

@asynccontextmanager
async def lifespan(_: FastAPI):
    suppress_healthcheck_access_logs()
    if settings.CAPTION_REMOTE_TOKEN:
        logger.info("Remote captions API auth enabled (CAPTION_REMOTE_TOKEN is set).")
    else:
        logger.warning(
            "Remote captions API auth is disabled (CAPTION_REMOTE_TOKEN is not set). "
            "All /v1/* routes are open."
        )
    yield

app = FastAPI(
    title="EStudio Captions API",
    version="0.1.0",
    description="Stateless transcription service for caption generation backends.",
    lifespan=lifespan,
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
