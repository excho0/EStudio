# AGENTS.md

This document explains the architecture and operational conventions of `estudio` for AI coding agents.

Use this as the primary orientation guide before making changes.

## 1) Project Purpose

`estudio` is a Next.js 16 application for creating, editing, rendering, publishing, and tracking media workflows.

Core capabilities:
- Create and edit content items with mode-specific settings.
- Preview Remotion compositions in the studio UI.
- Render videos/audio through selectable backends (`local` renderer or `lambda` backend).
- Queue render and publish jobs via BullMQ workers.
- Track progress in real-time with Socket.IO (optionally Redis adapter for multi-instance sync).
- Publish rendered outputs to provider integrations (currently YouTube-focused flow).
- Persist/render/publish/caption activity through a Notification Center domain.
- Manage global application settings (DB-backed) separately from system/general settings.

## 2) Runtime Topology

The app can run in three runtime modes through `src/runtime/runner.ts`:
- `api`: Next.js API/server only.
- `worker`: BullMQ worker only.
- `api+worker`: both API and worker processes.

Scripts (`package.json`):
- `pnpm dev` -> `api+worker`
- `pnpm dev:api`
- `pnpm dev:worker`
- `pnpm start` / `start:worker` / `start:all` (production env)

Important runtime files:
- `src/runtime/runner.ts`: process supervisor for api/worker modes.
- `src/runtime/server.ts`: bootstraps Next HTTP server + Socket.IO + metrics broadcast.
- `src/runtime/worker.ts`: BullMQ workers for render/publish queues.

## 3) High-Level Architecture (layered)

### UI Layer
- `src/app/(studio)/*` pages and route segments.
- `src/components/*` view components, studio hooks, controls.
- React Query is used for client data fetching and cache.

### Client SDK Layer
- `src/lib/sdk/*`
- Single facade entry (`sdk`) exposing domain clients (`sdk.content`, `sdk.user`, `sdk.publish`, etc.).
- Uses `ApiClient` with optional Zod schema parsing for typed responses.

### API Route Layer
- `src/app/api/**/route.ts`
- Route handlers should be thin: auth/session checks + call domain handlers in `src/lib/api/*`.

### API Domain Handler Layer
- `src/lib/api/*`
- Per-domain request logic, input normalization, orchestration.
- Delegates persistence to `src/lib/data/*`.
- Delegates rendering/publishing to `src/lib/rendering/*`, `src/lib/publishing/*`, queues.
- Delegates notifications and settings persistence to dedicated domain modules under `src/lib/data/*`.

### Data/Persistence Layer
- `src/lib/data/*`
- Domain-organized data modules with schemas, codecs, repository methods.
- Drizzle client/schema under `src/lib/drizzle/*`.
- SQLite is local default (`better-sqlite3` in stack).
- Global app settings are persisted in `app_settings` as JSON (`id = "global"` singleton row).

### Content Domain Layer
- `src/lib/content/*`
- Content asset paths/storage helpers, mode system, palette extraction, tokenized asset access.
- Content mode system is centralized in `src/lib/content/modes/*`.
- Asset analysis (palette/audio duration probing) may materialize storage objects into temp local files
  to remain compatible with non-local storage adapters.

### Async Processing Layer
- `src/lib/queue/*` for BullMQ queue creation/enqueue utilities.
- `src/lib/rendering/*` for backend selection, render execution, progress/snapshot tracking.
- `src/lib/publishing/*` for publish job processing and provider adapters.

### Realtime/Eventing Layer
- `src/lib/socket/*`: app-level event emission to Socket.IO channels/rooms.
- `src/lib/event-bus/*`: Redis event bus abstraction for cross-instance events.
- `src/lib/redis/*`: Redis client/manager utilities.
- Includes typed settings update propagation (`settings.updated` + `settings:updated`).

## 4) Folder-by-Folder Guide

### `src/app`
- App router pages/layouts.
- API routes live under `src/app/api` and should not contain heavy business logic.
- Studio pages:
  - `upload`, `edit/[id]`, `library`, `renders/[id]`, `publishes/[id]`, `settings/*`, `metrics`.
  - Settings pages currently include `general`, `application`, `notifications`, `profile`, `connections`, `appearance`.

### `src/lib/content`
- `store.ts`: content asset path generation and filesystem interactions.
- `color-palette.ts`: palette extraction.
- `asset-token.ts`: token generation/verification for protected asset access.
- `modes/registry.ts`: per-mode setting schemas/defaults and mode definitions.
- `modes/ui-registry.ts`: UI field/section registry for mode settings forms.
- `modes/ui-helpers.ts`: form serialization/deserialization/field logic.
- `modes/index.ts`: normalize/merge/resolve mode settings.

### `src/lib/data`
Domain data boundaries:
- `content/`: content schemas, codec, db/repository access.
- `publish/`: publish records and related persistence schemas.
- `render/`: render records/query persistence.
- `notifications/`: notification schemas, repository, DB access.
- `settings/`: global app settings schemas, repository/service, DB access.
- `user/`, `meta/`: respective domain data logic.
- `index.ts`: domain exports for server-side consumers.

### `src/lib/api`
Service handlers per domain:
- `content/collection.ts`: list/create content.
- `content/item.ts`: get/update/delete content item.
- `content/render.ts`: trigger render.
- `content/progress.ts`: progress querying.
- `content/publishes.ts`, `content/publish-item.ts`: publish actions.
- `content/asset.ts`: secure asset streaming.
- `user/*`: profile/connections/avatar/confirm-email.
- `publish/*`: provider metadata and provider item handlers.
- `notifications/*`: list + mark-read handlers.
- `settings.ts`, `meta/providers.ts`, `uploads/index.ts`, debug endpoints.

### `src/lib/sdk`
- `facade.ts`: instantiate and expose `sdk` object with domain clients.
- `client.ts`: base HTTP client wrappers (get/post/put/patch/del) + schema-aware parse.
- `domains/*`: typed methods matching backend route contracts.
- Includes `sdk.notifications` and `sdk.settings` for notification center and application settings flows.

### `src/lib/queue`
- `render-queue.ts`: enqueue and health utilities for render queue (includes backend in payload).
- `publish-queue.ts`: enqueue for publish queue.
- `health.ts` / `index.ts`: shared queue exports.

### `src/lib/rendering`
- `backend.ts`: render backend resolver/dispatcher (`local` or `lambda`) and lambda execution path.
- `execute-render-job.ts`: heavy render pipeline (Remotion renderMedia orchestration).
- `content-render-runner.ts`: content-aware render entrypoint.
- `progress-store.ts`, `snapshot-store.ts`: render progress tracking.

### `src/lib/publishing`
- provider abstractions and adapters.
- queue-side publish job execution path.

### `src/lib/socket`
- centralized websocket emission helpers.
- used by API/worker/render/publish flows to notify client in real-time.
- also emits settings updates and drives notification persistence snapshots.

### `src/remotion`
- Composition components and render logic.
- `ContentLoopComposition.tsx` is the main composition path for content loop mode.
- `ShaderVideoLayer.tsx` handles shader/canvas-based overlay processing.

### `src/types`
- canonical TypeScript contracts by domain (`api`, `content`, `studio`, `events`, etc.).
- add new shared contracts here before widening `any` in domain modules.

## 5) Core Data Model Principles

### Content settings model
- Mode-specific settings are persisted under `settings` map, keyed by mode.
- Base fields remain top-level content fields (not mode settings), especially:
  - `fps`
  - `width`
  - `height`
  - plus identity/state fields (`id`, `userId`, `title`, `status`, `mode`, timestamps, etc.)

### Global application settings model
- Global application settings are persisted in DB (`app_settings`) as JSON.
- Use singleton row `id = "global"` for read/write.
- Current global settings include caption backend selection.
- Do not reintroduce ad-hoc file-backed app settings.

### Legacy handling policy
- Legacy flat settings bridge was removed.
- Do **not** reintroduce conversions like `legacyColumnsToSettings` / `settingsToLegacyColumns`.
- New code must read/write mode settings through `settings` map only.

### Validation policy
- Prefer Zod schemas in `src/lib/data/*` and `src/lib/sdk/*` domain schemas.
- Parse close to ingress boundaries:
  - API handler input parsing
  - SDK response parsing (for typed client-side data)

## 6) Request/Response Flow (typical)

1. UI component/hook calls `sdk.<domain>.<method>()`.
2. SDK domain calls `ApiClient` method and parses response with Zod schema.
3. API route receives request and delegates to `src/lib/api/<domain>` handler.
4. API handler validates input, runs auth checks, and calls `src/lib/data/<domain>` repository logic.
5. Handler emits socket/event bus events as needed.
6. UI updates via React Query invalidation and/or realtime socket updates.

## 7) Render & Publish Job Flow

### Render
- Enqueue render job via API -> BullMQ `content-render` queue.
- API accepts optional backend selection via render request payload (`backend`).
- Worker (`src/runtime/worker.ts`) consumes queue and dispatches through `src/lib/rendering/backend.ts`.
- Local backend pipeline in `src/lib/rendering/execute-render-job.ts`:
  - bundles/selects composition
  - executes segmented renders
  - emits progress snapshots and socket updates
  - stores render artifacts and updates content status
- Lambda backend path dispatches using `@remotion/lambda-client`, polls progress, downloads output,
  stores artifact through storage adapter, and updates content status/events.

### Publish
- Publish actions enqueue `content-publish` jobs.
- Worker consumes and runs publish runner in publishing domain.
- Provider-specific logic lives under `src/lib/publishing/providers/*`.

## 8) Realtime & Multi-Instance Behavior

- Socket.IO server is created in `src/runtime/server.ts`.
- If Redis URL is configured, socket.io Redis adapter is enabled for horizontal scaling.
- Without Redis, it falls back to in-memory adapter (single-instance/dev).
- Event bus (`src/lib/event-bus`) is used for cross-process event propagation when needed.

## 9) Environment and Infra Expectations

Important environment variables used in multiple modules:
- `REDIS_URL` (shared default redis)
- `RENDER_QUEUE_REDIS_URL` / `PUBLISH_QUEUE_REDIS_URL` (queue-specific)
- `SOCKET_IO_REDIS_URL` (socket adapter)
- `CAPTION_BACKEND` (env fallback only when global settings do not set caption backend)
- `RENDER_BACKEND` (`local` default, `lambda` optional)
- `REMOTION_LAMBDA_FUNCTION_NAME` / `REMOTION_LAMBDA_REGION` / `REMOTION_LAMBDA_SERVE_URL`
  (required for direct lambda backend)
- `REMOTION_LAMBDA_BUCKET_NAME` (optional bucket override)
- `REMOTION_LAMBDA_POLL_MS` / `REMOTION_LAMBDA_TIMEOUT_MS` (lambda polling/timeout tuning)
- `RENDER_LAMBDA_DISPATCH_URL` (optional lambda dispatch fallback endpoint)
- render tuning vars in `execute-render-job.ts` (concurrency, GL backend, etc.)

Nix/flake notes:
- Project includes `flake.nix` and may run in Nix shells.
- Rendering + GPU behavior may vary by GL backend and headless mode.

Whisper (local captions) notes:
- Local captions backend uses `@remotion/install-whisper-cpp`.
- Host/dev shell must provide build tools: `git`, `cmake`, `make`, `gcc/g++`.
- Local transcription input is converted to 16k mono WAV before whisper run.
- Whisper cache uses storage keys (under local storage base dir): `cache/whisper-cpp`, `cache/whisper-models`.
- GPU is used automatically when supported by the local whisper.cpp build; no dedicated GPU toggle env is required.
- Optional local tuning:
  - `CAPTION_LOCAL_WHISPER_FLASH_ATTENTION=true`
  - `CAPTION_LOCAL_WHISPER_ADDITIONAL_ARGS='["--beam-size","5"]'`

## 10) Agent Rules for Safe Changes

1. Keep API routes thin
- put business logic in `src/lib/api/*` and persistence in `src/lib/data/*`.

2. Preserve domain boundaries
- avoid importing server-only modules into client code.
- avoid adding UI concerns into data modules.

3. Prefer SDK in client code
- client components should use `sdk` domains rather than ad-hoc `fetch` + manual parse.

4. Keep types strict
- no untyped payloads when a domain type already exists in `src/types`.
- no `any` unless unavoidable and isolated.

5. Respect settings model
- mode settings in `settings` map, base fields top-level.
- avoid reintroducing removed legacy bridges.

6. Queue/worker changes
- enqueue in API layer; execute heavy work in worker layer.
- keep worker logic idempotent and validation-first.

7. Realtime updates
- emit consistent events from one place (`src/lib/socket/manager.ts` / event bus).
- avoid scattering socket event names across unrelated modules.
8. Client/server import boundaries
- client code must import client-safe schema modules (for example `src/lib/data/*/schemas.ts`) and avoid server barrels that export DB/storage code.

## 11) Common Extension Playbooks

### Add a new content mode
1. Add schema/default/buildProps in `src/lib/content/modes/registry.ts`.
2. Add mode UI fields/sections in `src/lib/content/modes/ui-registry.ts`.
3. Ensure remotion composition and input props mapping support mode behavior.
4. Update edit/upload form behaviors via existing mode renderer helpers.

### Add a new API domain
1. Create `src/lib/data/<domain>/` with schemas + repository functions.
2. Create `src/lib/api/<domain>/` handler(s).
3. Add `src/app/api/.../route.ts` thin wrappers.
4. Add `src/lib/sdk/domains/<domain>.ts` client methods + zod response schemas.
5. Update UI hooks/pages to consume SDK domain methods.

### Add a new background job
1. Add queue module under `src/lib/queue`.
2. Add worker consumer in `src/runtime/worker.ts`.
3. Implement domain runner in `src/lib/<domain>/...`.
4. Add progress/events through socket manager/event bus as needed.

### Add or modify a render backend
1. Extend backend schema and resolution in `src/lib/rendering/backend.ts`.
2. Ensure API render handler accepts/validates backend request options.
3. Ensure render queue payload includes backend and worker dispatch respects it.
4. Keep render progress/status/socket events consistent across backends.
5. Update `.env.local.example` and this document with required environment variables.

## 12) Validation Checklist Before Commit

Run at minimum:
- `pnpm tsc --noEmit`
- `pnpm lint`

For behavior changes, also test manually:
- upload -> edit -> save -> render -> publish happy path.
- page refresh during render progress.
- API-only mode and worker-only mode boot behavior.
- render with `RENDER_BACKEND=local`.
- render with `RENDER_BACKEND=lambda` (or explicit request backend override) when lambda env is configured.

## 13) Known Practical Constraints

- Rendering/shader path has strict runtime differences between preview and headless render.
- GPU/GL backend behavior can vary by system setup.
- Redis optional mode exists; worker mode requires Redis URLs.
- Storage adapter currently defaults to local filesystem. Non-local storage drivers are planned but not fully implemented.

## 14) Source of Truth Summary

- Domain contracts: `src/types/*`
- Persistence contracts and repository operations: `src/lib/data/*`
- API business handlers: `src/lib/api/*`
- Client-side API usage: `src/lib/sdk/*`
- Content mode semantics: `src/lib/content/modes/*`
- Background job orchestration: `src/lib/queue/*`, `src/runtime/worker.ts`
- Rendering implementation: `src/lib/rendering/*`, `src/remotion/*`
- Realtime events: `src/lib/socket/*`, `src/lib/event-bus/*`

If an implementation appears to conflict with this document, prefer current `src/lib/data/*` schemas and `src/lib/content/modes/*` semantics as the practical source of truth.
