import { getPublishQueue, isPublishQueueEnabled } from "./publish-queue";
import { getRenderQueue, isRenderQueueEnabled } from "./render-queue";

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
  name: "render" | "publish",
  enabled: boolean,
  queue: ReturnType<typeof getRenderQueue> | ReturnType<typeof getPublishQueue>
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
  const renderQueue = getRenderQueue();
  const publishQueue = getPublishQueue();

  const [render, publish] = await Promise.all([
    describeQueue("render", renderEnabled, renderQueue),
    describeQueue("publish", publishEnabled, publishQueue),
  ]);

  return {
    timestamp: new Date().toISOString(),
    render,
    publish,
  };
};
