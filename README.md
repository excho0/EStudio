<div align="center">
  <img src="apps/web/public/favicon.png" alt="EStudio Logo" width="88" height="88" />
  <h1>EStudio Monorepo</h1>
  <p>
    Create, edit, caption, render, and publish media workflows with a single dev stack.
  </p>
</div>

---

## Overview

EStudio contains:

- `apps/web` - Next.js app, API routes, and worker runtime
- `apps/captions-api` - FastAPI transcription service

### Stack Services (Compose)

- `web` - Studio UI + API
- `worker` - Background jobs (render/publish queues)
- `captions-api` - Transcription backend
- `postgres` - Primary DB
- `redis` - Queue/pub-sub backing store

---

## Prerequisites

- Docker + Docker Compose (or Podman Compose)
- Optional GPU runtime support:
  - NVIDIA CDI: `nvidia.com/gpu=all`
  - AMD ROCm devices: `/dev/kfd`, `/dev/dri`

---

## Compose Files

- `docker-compose.yml` - base stack
- `docker-compose.nvidia.yml` - NVIDIA overrides for `captions-api`
- `docker-compose.amd.yml` - AMD overrides for `captions-api`

---

## Environment Setup

Compose uses real `.env` files at runtime:

- `apps/web/.env`
- `apps/captions-api/.env`

Use templates once:

```bash
cp apps/web/.env.example apps/web/.env
cp apps/captions-api/.env.example apps/captions-api/.env
```

> `.env.example` is documentation/template only.

---

## Quick Start

### Start (CPU)

```bash
docker compose -f docker-compose.yml up --build
```

### Start Detached

```bash
docker compose -f docker-compose.yml up -d --build
```

### Stop

```bash
docker compose -f docker-compose.yml down
```

---

## GPU Profiles

### NVIDIA

```bash
docker compose -f docker-compose.yml -f docker-compose.nvidia.yml up -d --build
```

### AMD

```bash
docker compose -f docker-compose.yml -f docker-compose.amd.yml up -d --build
```

---

## Podman Equivalents

### Base (CPU)

```bash
podman compose -f docker-compose.yml up -d --build
```

### NVIDIA

```bash
podman compose -f docker-compose.yml -f docker-compose.nvidia.yml up -d --build
```

### AMD

```bash
podman compose -f docker-compose.yml -f docker-compose.amd.yml up -d --build
```

---

## Endpoints

- Web app: `http://localhost:3000`
- Captions API: `http://localhost:8010`
- Redis: `localhost:6379`
- Postgres: `localhost:5432`

---

## Captions API Diagnostics

### Runtime

```bash
curl -s http://localhost:8010/v1/diagnostics/runtime
```

### Transcription Smoke

```bash
curl -s -X POST http://localhost:8010/v1/diagnostics/transcription-smoke
```
