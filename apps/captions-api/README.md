# captions-api

Stateless FastAPI service for transcription (WhisperX-oriented) used by EStudio workers.

## Goals
- Keep service dumb and stateless
- Accept audio input and return normalized caption payload
- Leave persistence/storage/state to `apps/web`

## Run (dev)

```bash
cd apps/captions-api
uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8010
```

## Endpoints
- `GET /health`
- `POST /v1/transcriptions`

## Notes
- `whisperx` is optional dependency (`[whisperx]`) so environment can bootstrap even before GPU runtime is ready.
- For production, prefer CUDA-enabled container runtime.
