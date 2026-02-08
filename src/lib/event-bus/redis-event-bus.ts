import { getRedisClient } from "@/lib/redis/client-manager";

export type EventPayload = Record<string, unknown>;

export type EventEnvelope<T extends EventPayload = EventPayload> = {
  topic: string;
  payload: T;
  at: string;
};

const channelFor = (topic: string) => `event-bus:${topic}`;

export const publishEvent = async <T extends EventPayload>(
  topic: string,
  payload: T
) => {
  const client = await getRedisClient("event-bus");
  if (!client) return false;
  try {
    const envelope: EventEnvelope<T> = {
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

export const subscribeToEvent = async <T extends EventPayload>(
  topic: string,
  handler: (event: EventEnvelope<T>) => void | Promise<void>
) => {
  const base = await getRedisClient("event-bus");
  if (!base) return async () => {};

  const subscriber = base.duplicate();
  await subscriber.connect();
  await subscriber.subscribe(channelFor(topic), async (message) => {
    try {
      const parsed = JSON.parse(message) as EventEnvelope<T>;
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
  emit: <T extends EventPayload>(topic: string, payload: T) => Promise<boolean>;
  on: <T extends EventPayload>(
    topic: string,
    handler: (event: EventEnvelope<T>) => void | Promise<void>
  ) => Promise<() => Promise<void>>;
};

export const eventBus: EventBus = {
  emit: publishEvent,
  on: subscribeToEvent,
};
