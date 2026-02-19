import { getPublishQueue, isPublishQueueEnabled } from "./publish-queue";
import { getRenderQueue, isRenderQueueEnabled } from "./render-queue";
import { getCaptionQueue, isCaptionQueueEnabled } from "./caption-queue";

const getQueueCounts = async (queue: {
  getWaitingCount: () => Promise<number>;
  getActiveCount: () => Promise<number>;
  getDelayedCount: () => Promise<number>;
  getFailedCount: () => Promise<number>;
  getCompletedCount: () => Promise<number>;
}) => {
  const [waiting, active, delayed, failed, completed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getDelayedCount(),
    queue.getFailedCount(),
    queue.getCompletedCount(),
  ]);
  return { waiting, active, delayed, failed, completed };
};

const describeQueue = async (
  name: "render" | "publish" | "caption",
  enabled: boolean,
  queue:
    | ReturnType<typeof getRenderQueue>
    | ReturnType<typeof getPublishQueue>
    | ReturnType<typeof getCaptionQueue>
) => {
  if (!enabled) {
    return {
      name,
      enabled: false,
      connected: false,
      counts: null,
      reason: "queue-disabled-or-missing-redis-url",
    };
  }
  if (!queue) {
    return {
      name,
      enabled: true,
      connected: false,
      counts: null,
      reason: "queue-not-initialized",
    };
  }
  try {
    const counts = await getQueueCounts(queue);
    return {
      name,
      enabled: true,
      connected: true,
      counts,
      reason: null,
    };
  } catch {
    return {
      name,
      enabled: true,
      connected: false,
      counts: null,
      reason: "queue-count-query-failed",
    };
  }
};

export const getQueueHealth = async () => {
  const renderEnabled = isRenderQueueEnabled();
  const publishEnabled = isPublishQueueEnabled();
  const captionEnabled = isCaptionQueueEnabled();
  const renderQueue = getRenderQueue();
  const publishQueue = getPublishQueue();
  const captionQueue = getCaptionQueue();

  const [render, publish, caption] = await Promise.all([
    describeQueue("render", renderEnabled, renderQueue),
    describeQueue("publish", publishEnabled, publishQueue),
    describeQueue("caption", captionEnabled, captionQueue),
  ]);

  return {
    timestamp: new Date().toISOString(),
    render,
    publish,
    caption,
  };
};
