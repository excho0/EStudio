import { NextResponse } from "next/server";
import { eventBus } from "@/lib/event-bus";
import { emitContentUpdate } from "@/lib/socket/manager";
import { getContentItem, updateContentItem } from "@/lib/data/content";
import { enqueueRenderJob, isRenderQueueEnabled } from "@/lib/queue/render-queue";
import {
  ContentRenderError,
  executeRenderForContent,
} from "@/lib/rendering/content-render-runner";

export const handleRenderRequest = async (request: Request, userId: string, id: string) => {
  const item = await getContentItem(userId, id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const shouldUseQueue = isRenderQueueEnabled();
  if (shouldUseQueue) {
    try {
      await updateContentItem(userId, id, { status: "rendering" });
      emitContentUpdate({ userId, type: "content:status", id, status: "rendering" });
      await enqueueRenderJob({ id, userId });
      void eventBus.emit("render.queued", { userId, id });
      return NextResponse.json(
        { ok: true, status: "queued", id },
        { status: 202 }
      );
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
