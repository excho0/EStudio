import { getRedisClient } from "@/lib/redis/client-manager";
import type { AppEventMap } from "@/types";

export type EventPayload = Record<string, unknown>;
export type EventTopic = keyof AppEventMap;

export type EventEnvelope<
  TTopic extends EventTopic = EventTopic,
  TPayload extends EventPayload = AppEventMap[TTopic]
> = {
  topic: TTopic;
  payload: TPayload;
  at: string;
};

const channelFor = (topic: EventTopic) => `event-bus:${topic}`;

export const publishEvent = async <TTopic extends EventTopic>(
  topic: TTopic,
  payload: AppEventMap[TTopic]
) => {
  const client: Awaited<ReturnType<typeof getRedisClient>> =
    await getRedisClient("event-bus");
  if (!client) return false;
  try {
    const envelope: EventEnvelope<TTopic, AppEventMap[TTopic]> = {
      topic,
      payload,
      at: new Date().toISOString(),
    };
    await client.publish(channelFor(topic), JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
};

export const subscribeToEvent = async <TTopic extends EventTopic>(
  topic: TTopic,
  handler: (event: EventEnvelope<TTopic, AppEventMap[TTopic]>) => void | Promise<void>
) => {
  const base: Awaited<ReturnType<typeof getRedisClient>> =
    await getRedisClient("event-bus");
  if (!base) return async () => {};

  const subscriber = base.duplicate();
  await subscriber.connect();
  await subscriber.subscribe(channelFor(topic), async (message) => {
    try {
      const parsed = JSON.parse(message) as EventEnvelope<TTopic, AppEventMap[TTopic]>;
      await handler(parsed);
    } catch {
      // ignore malformed event
    }
  });

  return async () => {
    try {
      await subscriber.unsubscribe(channelFor(topic));
    } finally {
      await subscriber.quit();
    }
  };
};

export type EventBus = {
  emit: <TTopic extends EventTopic>(
    topic: TTopic,
    payload: AppEventMap[TTopic]
  ) => Promise<boolean>;
  on: <TTopic extends EventTopic>(
    topic: TTopic,
    handler: (event: EventEnvelope<TTopic, AppEventMap[TTopic]>) => void | Promise<void>
  ) => Promise<() => Promise<void>>;
};

export const eventBus: EventBus = {
  emit: publishEvent,
  on: subscribeToEvent,
};
