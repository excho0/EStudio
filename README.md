# EStudio Monorepo

EStudio contains the web app, worker runtime, and captions API in one repository.

## Apps

- `apps/web`: Next.js app + API + worker entrypoints
- `apps/captions-api`: FastAPI WhisperX transcription service

## Requirements

- Docker / Docker Compose
- Optional GPU runtime:
  - NVIDIA CDI: `nvidia.com/gpu=all`
  - AMD ROCm devices: `/dev/kfd`, `/dev/dri`

## Compose Files

- `docker-compose.yml`: base stack (CPU-safe defaults)
- `docker-compose.nvidia.yml`: NVIDIA CUDA overrides for `captions-api`
- `docker-compose.amd.yml`: AMD ROCm device mapping overrides for `captions-api`

## Start the Stack

Base (CPU):

```bash
docker compose -f docker-compose.yml up --build
```

Detach:

```bash
docker compose -f docker-compose.yml up -d --build
```

Stop:

```bash
docker compose -f docker-compose.yml down
```

## GPU Profiles

NVIDIA (CDI):

```bash
docker compose -f docker-compose.yml -f docker-compose.nvidia.yml up -d --build
```

AMD (ROCm devices):

```bash
docker compose -f docker-compose.yml -f docker-compose.amd.yml up -d --build
```

## Podman Equivalents

Base (CPU):

```bash
podman compose -f docker-compose.yml up -d --build
```

NVIDIA (CDI):

```bash
podman compose -f docker-compose.yml -f docker-compose.nvidia.yml up -d --build
```

AMD (ROCm devices):

```bash
podman compose -f docker-compose.yml -f docker-compose.amd.yml up -d --build
```

## Build Only

Build full stack:

```bash
docker compose -f docker-compose.yml build
```

Build captions-api with NVIDIA profile:

```bash
docker compose -f docker-compose.yml -f docker-compose.nvidia.yml build captions-api
```

## Service Endpoints

- Web app: `http://localhost:3000`
- Captions API: `http://localhost:8010`
- Redis: `localhost:6379`
- Postgres: `localhost:5432`

## Captions API Diagnostics

- Runtime checks:

```bash
curl -s http://localhost:8010/v1/diagnostics/runtime
```

- Transcription smoke:

```bash
curl -s -X POST http://localhost:8010/v1/diagnostics/transcription-smoke
```
