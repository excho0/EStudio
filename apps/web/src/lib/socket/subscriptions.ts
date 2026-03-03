import type { Socket } from "socket.io-client";
import type { SocketEventPayloadMap } from "@/lib/socket/events";

type SocketSubscriptionByEvent = {
  [K in keyof SocketEventPayloadMap]: Readonly<{
    event: K;
    handler: (payload: SocketEventPayloadMap[K]) => void;
  }>;
}[keyof SocketEventPayloadMap];

export type SocketSubscription = SocketSubscriptionByEvent;

export const attachSocketSubscriptions = <
  const Subs extends ReadonlyArray<SocketSubscription>,
>(
  socket: Socket,
  subscriptions: Subs
) => {
  subscriptions.forEach(({ event, handler }) => {
    socket.on(event, handler as (...args: unknown[]) => void);
  });

  return () => {
    subscriptions.forEach(({ event, handler }) => {
      socket.off(event, handler as (...args: unknown[]) => void);
    });
  };
};
