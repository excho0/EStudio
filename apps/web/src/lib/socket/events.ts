import type {
  AppEventMap,
  MetricsSubscribePayload,
  MetricsUnsubscribePayload,
  MetricsUpdateEventPayload,
  UserRegisterPayload,
} from "@/types";
import { z } from "zod";

type SocketEvent<Name extends string, Payload> = Name & {
  readonly __socketPayload?: Payload;
};

const defineEvent = <Payload, const Name extends string>(
  name: Name
) => name as SocketEvent<Name, Payload>;

type FlattenEventNames<T> = T extends string
  ? T
  : T extends Record<string, unknown>
    ? {
        [K in keyof T]: FlattenEventNames<T[K]>;
      }[keyof T]
    : never;

type EmptyRecord = Record<never, never>;

type EventPayloadMapFromTree<T> = T extends string
  ? T extends SocketEvent<infer Name, infer Payload>
    ? { [K in Name]: Payload }
    : EmptyRecord
  : T extends Record<string, unknown>
    ? UnionToIntersection<
        {
          [K in keyof T]: EventPayloadMapFromTree<T[K]>;
        }[keyof T]
      >
    : EmptyRecord;

type UnionToIntersection<U> = (
  U extends unknown ? (arg: U) => void : never
) extends (arg: infer I) => void
  ? I
  : never;

const flattenSocketEventValues = (value: unknown): string[] => {
  if (typeof value === "string") {
    return [value];
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.values(value).flatMap((entry) => flattenSocketEventValues(entry));
};

export const SocketEvents = {
  connect: defineEvent<undefined, "connect">("connect"),
  disconnect: defineEvent<string, "disconnect">("disconnect"),
  connectError: defineEvent<Error, "connect_error">("connect_error"),
  user: {
    register: defineEvent<UserRegisterPayload, "user.register">("user.register"),
  },
  metrics: {
    update: defineEvent<MetricsUpdateEventPayload, "metrics.update">("metrics.update"),
    subscribe: defineEvent<MetricsSubscribePayload, "metrics.subscribe">(
      "metrics.subscribe"
    ),
    unsubscribe: defineEvent<MetricsUnsubscribePayload, "metrics.unsubscribe">(
      "metrics.unsubscribe"
    ),
  },
  content: {
    update: defineEvent<AppEventMap["content.update"], "content.update">("content.update"),
    created: defineEvent<AppEventMap["content.created"], "content.created">("content.created"),
    updated: defineEvent<AppEventMap["content.updated"], "content.updated">("content.updated"),
    deleted: defineEvent<AppEventMap["content.deleted"], "content.deleted">("content.deleted"),
    statusChanged: defineEvent<
      AppEventMap["content.status.changed"],
      "content.status.changed"
    >("content.status.changed"),
  },
  render: {
    queued: defineEvent<AppEventMap["render.queued"], "render.queued">("render.queued"),
    started: defineEvent<AppEventMap["render.started"], "render.started">("render.started"),
    progress: defineEvent<AppEventMap["render.progress"], "render.progress">("render.progress"),
    completed: defineEvent<AppEventMap["render.completed"], "render.completed">(
      "render.completed"
    ),
    failed: defineEvent<AppEventMap["render.failed"], "render.failed">("render.failed"),
    cancelRequested: defineEvent<
      AppEventMap["render.cancel-requested"],
      "render.cancel-requested"
    >("render.cancel-requested"),
  },
  publish: {
    update: defineEvent<AppEventMap["publish.update"], "publish.update">("publish.update"),
    queued: defineEvent<AppEventMap["publish.queued"], "publish.queued">("publish.queued"),
    started: defineEvent<AppEventMap["publish.started"], "publish.started">("publish.started"),
    progress: defineEvent<AppEventMap["publish.progress"], "publish.progress">("publish.progress"),
    completed: defineEvent<AppEventMap["publish.completed"], "publish.completed">(
      "publish.completed"
    ),
    failed: defineEvent<AppEventMap["publish.failed"], "publish.failed">("publish.failed"),
  },
  caption: {
    update: defineEvent<AppEventMap["caption.update"], "caption.update">("caption.update"),
    queued: defineEvent<AppEventMap["caption.queued"], "caption.queued">("caption.queued"),
    started: defineEvent<AppEventMap["caption.started"], "caption.started">("caption.started"),
    completed: defineEvent<AppEventMap["caption.completed"], "caption.completed">(
      "caption.completed"
    ),
    failed: defineEvent<AppEventMap["caption.failed"], "caption.failed">("caption.failed"),
  },
  providerConnection: {
    created: defineEvent<
      AppEventMap["provider.connection.created"],
      "provider.connection.created"
    >("provider.connection.created"),
    deleted: defineEvent<
      AppEventMap["provider.connection.deleted"],
      "provider.connection.deleted"
    >("provider.connection.deleted"),
  },
  userProfile: {
    updated: defineEvent<AppEventMap["user.profile.updated"], "user.profile.updated">(
      "user.profile.updated"
    ),
  },
  settings: {
    updated: defineEvent<AppEventMap["settings.updated"], "settings.updated">(
      "settings.updated"
    ),
  },
} as const;

const APP_EVENT_NAMES = {
  content: SocketEvents.content,
  render: SocketEvents.render,
  publish: SocketEvents.publish,
  caption: SocketEvents.caption,
  providerConnection: SocketEvents.providerConnection,
  userProfile: SocketEvents.userProfile,
  settings: SocketEvents.settings,
} as const;

export type SocketEventName = FlattenEventNames<typeof SocketEvents>;
export type AppSocketEventName = FlattenEventNames<typeof APP_EVENT_NAMES>;
export type SocketEventPayloadMap = EventPayloadMapFromTree<typeof SocketEvents>;

const APP_EVENT_TOPICS_VALUES = flattenSocketEventValues(APP_EVENT_NAMES).filter(
  (value): value is AppSocketEventName => typeof value === "string"
);

export const appEventTopicSchema = z.enum(
  APP_EVENT_TOPICS_VALUES as [AppSocketEventName, ...AppSocketEventName[]]
);
export const APP_EVENT_TOPICS = APP_EVENT_TOPICS_VALUES;
