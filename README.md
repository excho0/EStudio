# EStudio

A creator‑focused studio for generating, managing, and publishing audiovisual content.  
Built with Next.js, Remotion, Drizzle, and real‑time updates via Socket.IO.

## What It Does

- Create content items (video + audio + metadata).
- Render looped compositions with Remotion (server‑side).
- Track render progress live in the studio UI.
- Publish to connected providers (YouTube today, others later).
- Keep everything user‑scoped (DB + storage + sockets).

## Key Concepts

**Content items**  
A content item is a single project with metadata + assets. It owns:
- source assets (thumbnail, video, song)
- renders (exported mp4 files)
- a manifest file to support rescan + recovery

**User‑scoped storage**  
All files are stored under:

```
data/users/{userId}/
  uploads/
  renders/
  manifests/
```

This makes it safe to multi‑tenant later without refactoring.

**User‑scoped DB**  
`content_items` has a `userId` foreign key with indexes for queries by user.

**Real‑time updates**  
Socket events emit to a room per user (`user:{id}`), so multiple devices can stay in sync.

## Architecture (Short)

- **Studio UI**: `src/app/(studio)`  
  Auth‑guarded routes for editing, rendering, uploading, and publishing.
- **API**: `src/app/api`  
  Content CRUD, uploads, render, publish, and provider info endpoints.
- **Storage**: `src/lib/storage`  
  Adapter‑based filesystem layer (future‑proof for buckets).
- **Publishing**: `src/lib/publishing`  
  Provider registry + adapters (YouTube implemented).

## Development

Run the dev server:

```bash
pnpm dev
```

Apply migrations:

```bash
pnpm drizzle:dev:migrate
```

## Environment

Core env variables you will need:

```
DATABASE_URL=
AUTH_SECRET=
AUTH_URL=
CONTENT_ASSET_SIGNING_SECRET=
```

`CONTENT_ASSET_SIGNING_SECRET` signs short‑lived tokens used by Remotion to fetch assets while rendering server‑side.

Render/shader env variables:

```
REMOTION_RENDER_CONCURRENCY=
REMOTION_OFFTHREAD_VIDEO_THREADS=
REMOTION_RENDER_ENABLE_SHADER=false
REMOTION_RENDER_GL=
```

Notes:
- `REMOTION_RENDER_ENABLE_SHADER=false` is the safe default for headless exports.
- Set `REMOTION_RENDER_ENABLE_SHADER=true` only if you explicitly want shader effects in final renders.
- If shader render is enabled, optionally set `REMOTION_RENDER_GL` to one of: `angle`, `egl`, `swiftshader`, `swangle`.

## How Rendering Works

1) User triggers `/api/content/[id]/render`  
2) Remotion renders in the server process  
3) Render progress emits via Socket.IO  
4) Rendered mp4 is stored in `data/users/{id}/renders/{contentId}`

## How Publishing Works

1) User selects provider + render + metadata  
2) `/api/content/[id]/publishes` stores a publish record  
3) Background queue processes uploads  
4) Status + progress update live via Socket.IO

## Future Scaling Ideas

You already have the right abstractions. Scaling is mostly “swap‑in”:

- **Storage** → add S3/R2 adapter for `src/lib/storage`
- **Queue** → move publish/render jobs to a persistent worker (BullMQ/pg‑boss)
- **Sockets** → add Redis adapter for multi‑node Socket.IO
- **Rendering** → separate render workers (dedicated machines / GPU nodes)
- **Rendering (serverless)** → evaluate Remotion Lambda for burst renders and queue offloading
- **CDN** → serve assets and renders via signed URLs

## Notes

This repo is optimized for iteration and rapid product development.  
If you want SaaS‑grade scaling, the above steps are the intended upgrade path.
