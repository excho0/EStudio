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
const inMemorySubscribers = new Map<
  EventTopic,
  Set<(event: EventEnvelope<EventTopic, AppEventMap[EventTopic]>) => void | Promise<void>>
>();

const publishToInMemory = async <TTopic extends EventTopic>(
  topic: TTopic,
  envelope: EventEnvelope<TTopic, AppEventMap[TTopic]>
) => {
  const subscribers = inMemorySubscribers.get(topic);
  if (!subscribers || subscribers.size === 0) return;
  await Promise.all(
    Array.from(subscribers).map(async (subscriber) => {
      try {
        await subscriber(
          envelope as EventEnvelope<EventTopic, AppEventMap[EventTopic]>
        );
      } catch {
        // ignore subscriber errors
      }
    })
  );
};

export const publishEvent = async <TTopic extends EventTopic>(
  topic: TTopic,
  payload: AppEventMap[TTopic]
) => {
  const client: Awaited<ReturnType<typeof getRedisClient>> =
    await getRedisClient("event-bus");
  const envelope: EventEnvelope<TTopic, AppEventMap[TTopic]> = {
    topic,
    payload,
    at: new Date().toISOString(),
  };
  if (!client) {
    await publishToInMemory(topic, envelope);
    return true;
  }
  try {
    await client.publish(channelFor(topic), JSON.stringify(envelope));
    return true;
  } catch {
    await publishToInMemory(topic, envelope);
    return false;
  }
};

export const subscribeToEvent = async <TTopic extends EventTopic>(
  topic: TTopic,
  handler: (event: EventEnvelope<TTopic, AppEventMap[TTopic]>) => void | Promise<void>
) => {
  const base: Awaited<ReturnType<typeof getRedisClient>> =
    await getRedisClient("event-bus");
  if (!base) {
    const subscribers = inMemorySubscribers.get(topic) ?? new Set();
    const adapter = async (
      event: EventEnvelope<EventTopic, AppEventMap[EventTopic]>
    ) => {
      await handler(event as EventEnvelope<TTopic, AppEventMap[TTopic]>);
    };
    subscribers.add(adapter);
    inMemorySubscribers.set(topic, subscribers);
    return async () => {
      const entries = inMemorySubscribers.get(topic);
      if (!entries) return;
      entries.delete(adapter);
      if (entries.size === 0) {
        inMemorySubscribers.delete(topic);
      }
    };
  }

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
