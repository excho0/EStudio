# EStudio Web (`apps/web`)

Next.js 16 studio app for content upload/edit/render/publish workflows with realtime updates.

## Scope

This app includes:
- Studio UI pages (`src/app/(studio)`)
- API routes (`src/app/api`)
- Background runtime entrypoints (`src/runtime`) for API/worker modes
- Rendering, queue, publishing, notifications, and settings domains (`src/lib/*`)
- Remotion compositions (`src/remotion/*`)

## Runtime Modes

Runtime is controlled by `src/runtime/runner.ts`:
- `api` - Next.js API/server only
- `worker` - BullMQ workers only
- `api+worker` - both

Common scripts:

```bash
pnpm dev           # api+worker
pnpm dev:api
pnpm dev:worker
pnpm start         # production api
pnpm start:worker
pnpm start:all
```

## Core Architecture

- UI: `src/app`, `src/components`
- API handlers: `src/lib/api/*`
- Data/repositories/schemas: `src/lib/data/*`
- SDK client facade: `src/lib/sdk/*`
- Content mode system: `src/lib/content/modes/*`
- Rendering pipeline: `src/lib/rendering/*`
- Queues: `src/lib/queue/*`
- Publishing: `src/lib/publishing/*`
- Realtime events: `src/lib/socket/*`, `src/lib/event-bus/*`

## Render & Publish

- Render queue: `content-render` (local backend or Remotion lambda backend)
- Publish queue: `content-publish`
- Worker process is in `src/runtime/worker.ts`

## Captions

- Captions are supported in modes and Remotion layer rendering
- Backends include local whisper-cpp and OpenAI whisper flows
- Shared captions data is stored in settings under `__shared.captionsData`

## Storage & Database

- Default DB stack uses Drizzle + SQLite locally (`better-sqlite3`)
- Storage uses adapter abstraction under `src/lib/storage`
- Local data path (containerized) typically maps to `/app/data`

## Environment (high-impact)

- Redis:
  - `REDIS_URL`
  - optional overrides: `RENDER_QUEUE_REDIS_URL`, `PUBLISH_QUEUE_REDIS_URL`, `SOCKET_IO_REDIS_URL`
- Render backend:
  - `RENDER_BACKEND=local|lambda`
  - lambda: `REMOTION_LAMBDA_FUNCTION_NAME`, `REMOTION_LAMBDA_REGION`, `REMOTION_LAMBDA_SERVE_URL`
- Caption backend fallback:
  - `CAPTION_BACKEND`

See `.env.example` for the full list.

## Migrations

```bash
pnpm drizzle:dev:generate
pnpm drizzle:dev:migrate
```

## Validation

Run before commit:

```bash
pnpm tsc --noEmit
pnpm lint
```

## Monorepo Notes

This app now lives in `apps/web` under the EStudio monorepo root.
Infrastructure orchestration (compose, nix, future terraform/helm) is managed at repo root.

## Source of Truth

For deeper architecture details and extension rules, use:
- `apps/web/AGENTS.md`
