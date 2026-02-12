import { NextResponse } from "next/server";
import IORedis from "ioredis";
import { eventBus } from "@/lib/event-bus";
import { emitContentUpdate } from "@/lib/socket/manager";
import { getContentItem, updateContentItem } from "@/lib/data/content";
import { enqueueRenderJob, isRenderQueueEnabled } from "@/lib/queue/render-queue";
import {
  ContentRenderError,
  executeRenderForContent,
} from "@/lib/rendering/content-render-runner";

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

  if (item.status === "rendering") {
    return NextResponse.json({ ok: true, status: "rendering", id }, { status: 202 });
  }

  const shouldUseQueue = isRenderQueueEnabled();
  if (shouldUseQueue) {
    try {
      const queued = await withRenderRequestLock(userId, id, async () => {
        await enqueueRenderJob({ id, userId });
        await updateContentItem(userId, id, { status: "rendering" });
        emitContentUpdate({ userId, type: "content:status", id, status: "rendering" });
        void eventBus.emit("render.queued", { userId, id });
        return true;
      });
      if (queued) {
        return NextResponse.json(
          { ok: true, status: "queued", id },
          { status: 202 }
        );
      }
      return NextResponse.json({ ok: true, status: "rendering", id }, { status: 202 });
    } catch (error) {
      console.warn("[render] queue enqueue failed, falling back to inline", error);
    }
  }

  try {
    const result = await executeRenderForContent({
      userId,
      id,
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
