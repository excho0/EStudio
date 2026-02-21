from pydantic import BaseModel, Field


class TranscriptionRequest(BaseModel):
    language: str | None = Field(default=None, description="ISO language hint, optional")
    diarize: bool = Field(default=False)


class CaptionToken(BaseModel):
    text: str
    fromMs: int
    toMs: int


class TranscriptionResponse(BaseModel):
    backend: str
    language: str | None = None
    captions: list[CaptionToken]
    durationMs: int | None = None
