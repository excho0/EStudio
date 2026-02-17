import { NextResponse } from "next/server";
import IORedis from "ioredis";
import { eventBus } from "@/lib/event-bus";
import {
  clearRenderProgressSnapshot,
  emitContentUpdate,
  getRenderProgressSnapshot,
} from "@/lib/socket/manager";
import { getContentItem, updateContentItem } from "@/lib/data/content";
import {
  cancelRenderJob,
  enqueueRenderJob,
  isRenderQueueEnabled,
} from "@/lib/queue/render-queue";
import { triggerRenderRequestSchema } from "@/lib/data/render";
import { contentModeRegistry, normalizeSettingsMap } from "@/lib/content/modes";
import { hasAnyRenderedOutput } from "@/lib/content/store";
import {
  ContentRenderError,
} from "@/lib/rendering/content-render-runner";
import {
  executeRenderForContentWithBackend,
  resolveRenderBackend,
} from "@/lib/rendering/backend";
import {
  clearRenderCancellation,
  requestRenderCancellation,
} from "@/lib/rendering/cancel-store";
import { getLogger } from "@/lib/logging";

const logger = getLogger("api-content-render");

const resolveRenderRedisUrl = () =>
  process.env.RENDER_QUEUE_REDIS_URL?.trim() || process.env.REDIS_URL?.trim() || "";

const withRenderRequestLock = async <T>(
  userId: string,
  id: string,
  fn: () => Promise<T>
) => {
  const redisUrl = resolveRenderRedisUrl();
  if (!redisUrl) {
    return fn();
  }

  const lockKey = `render:lock:${userId}:${id}`;
  const lockToken = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const client = new IORedis(redisUrl, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    lazyConnect: true,
  });

  try {
    await client.connect();
    const acquired = await client.set(lockKey, lockToken, "PX", 30_000, "NX");
    if (acquired !== "OK") {
      return null;
    }
    return await fn();
  } finally {
    try {
      await client.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        lockKey,
        lockToken
      );
    } catch {
      // no-op
    }
    await client.quit().catch(() => null);
  }
};

export const handleRenderRequest = async (request: Request, userId: string, id: string) => {
  const item = await getContentItem(userId, id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const activeProgress = await getRenderProgressSnapshot(userId);
  if (activeProgress[id]) {
    return NextResponse.json({ ok: true, status: "rendering", id }, { status: 202 });
  }

  const requestPayload = triggerRenderRequestSchema
    .safeParse(await request.json().catch(() => null))
    .data;
  await clearRenderCancellation(userId, id);
  const backend = resolveRenderBackend(requestPayload?.backend);
  const requestedMode = requestPayload?.mode?.trim();
  if (requestedMode) {
    if (!(requestedMode in contentModeRegistry)) {
      return NextResponse.json({ error: "Invalid render mode." }, { status: 400 });
    }
    const settingsMap = normalizeSettingsMap(item.mode, item.settings ?? {});
    if (!settingsMap[requestedMode]) {
      return NextResponse.json(
        { error: "Requested render mode is not configured for this content." },
        { status: 400 }
      );
    }
  }

  const shouldUseQueue = isRenderQueueEnabled();
  if (shouldUseQueue) {
    try {
      const queued = await withRenderRequestLock(userId, id, async () => {
        await enqueueRenderJob({ id, userId, backend, mode: requestedMode });
        await updateContentItem(userId, id, { status: "rendering" });
        emitContentUpdate({ userId, type: "content:status", id, status: "rendering" });
        void eventBus.emit("render.queued", {
          userId,
          id,
          backend,
          mode: requestedMode,
        });
        return true;
      });
      if (queued) {
        return NextResponse.json(
          { ok: true, status: "queued", id, backend, mode: requestedMode },
          { status: 202 }
        );
      }
      return NextResponse.json(
        { ok: true, status: "rendering", id, backend, mode: requestedMode },
        { status: 202 }
      );
    } catch (error) {
      logger.warn(
        { error },
        "Queue enqueue failed. Falling back to inline rendering."
      );
    }
  }

  try {
    const result = await executeRenderForContentWithBackend({
      userId,
      id,
      backend,
      mode: requestedMode,
      requestUrl: request.url,
    });
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    if (error instanceof ContentRenderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Render failed. Please check server logs.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};

export const handleCancelRenderRequest = async (userId: string, id: string) => {
  const item = await getContentItem(userId, id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await requestRenderCancellation(userId, id);
  const activeProgress = await getRenderProgressSnapshot(userId);
  if (activeProgress[id] || item.status === "rendering") {
    await clearRenderProgressSnapshot({ userId, id });
    return NextResponse.json({ ok: true, status: "canceling", id }, { status: 202 });
  }

  if (!isRenderQueueEnabled()) {
    await clearRenderProgressSnapshot({ userId, id });
    return NextResponse.json(
      { ok: true, status: "canceling", id },
      { status: 202 }
    );
  }

  const canceled = await cancelRenderJob(userId, id);
  if (!canceled.ok) {
    if (canceled.reason === "not_found") {
      return NextResponse.json({ error: "No queued render job found for this item." }, { status: 404 });
    }
    return NextResponse.json({ error: "Render job is not cancelable." }, { status: 409 });
  }

  const latest = await getContentItem(userId, id);
  if (latest?.status === "rendering") {
    const nextStatus = (await hasAnyRenderedOutput(userId, id))
      ? "rendered"
      : "uploaded";
    await updateContentItem(userId, id, { status: nextStatus });
    emitContentUpdate({ userId, type: "content:status", id, status: nextStatus });
  }
  await clearRenderProgressSnapshot({ userId, id });
  await clearRenderCancellation(userId, id);
  return NextResponse.json({ ok: true, status: "canceled", id }, { status: 200 });
};
