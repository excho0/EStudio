"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/http/query-keys";
import { sdk } from "@/lib/sdk";
import type { MetricsPayload } from "@/types";
import { toast } from "sonner";
import { notifyOSAppEvent } from "@/lib/notifications";
import { SocketEvents } from "@/lib/socket/events";
import { attachSocketSubscriptions } from "@/lib/socket/subscriptions";

type SocketIOContextValue = {
  connected: boolean;
  status: "connecting" | "connected" | "disconnected" | "error";
  eventToken: number;
  socket: Socket | null;
};

const SocketIOContext = createContext<SocketIOContextValue | null>(null);
const MetricsContext = createContext<MetricsPayload | null>(null);
const COMPLETION_SOUND_SRC = "/sounds/render-complete.mp3";

type WindowWithSocket = Window & {
  __appSocket?: Socket;
  __realtimeToastStartedKeys?: Set<string>;
  __realtimeToastCompletedKeys?: Set<string>;
  __realtimeCanceledRenderKeys?: Set<string>;
  __realtimeCanceledRenderIds?: Set<string>;
};

const getBrowserSocket = () => {
  if (typeof window === "undefined") {
    return null;
  }
  const win = window as WindowWithSocket;
  if (!win.__appSocket) {
    win.__appSocket = io({
      path: "/api/socket",
      autoConnect: true,
      addTrailingSlash: false,
      transports: ["websocket", "polling"],
    });
  }
  return win.__appSocket;
};

const getStartedKeys = () => {
  if (typeof window === "undefined") return null;
  const win = window as WindowWithSocket;
  if (!win.__realtimeToastStartedKeys) {
    win.__realtimeToastStartedKeys = new Set<string>();
  }
  return win.__realtimeToastStartedKeys;
};

const getCompletedKeys = () => {
  if (typeof window === "undefined") return null;
  const win = window as WindowWithSocket;
  if (!win.__realtimeToastCompletedKeys) {
    win.__realtimeToastCompletedKeys = new Set<string>();
  }
  return win.__realtimeToastCompletedKeys;
};

const getCanceledRenderKeys = () => {
  if (typeof window === "undefined") return null;
  const win = window as WindowWithSocket;
  if (!win.__realtimeCanceledRenderKeys) {
    win.__realtimeCanceledRenderKeys = new Set<string>();
  }
  return win.__realtimeCanceledRenderKeys;
};


const getCanceledRenderIds = () => {
  if (typeof window === "undefined") return null;
  const win = window as WindowWithSocket;
  if (!win.__realtimeCanceledRenderIds) {
    win.__realtimeCanceledRenderIds = new Set<string>();
  }
  return win.__realtimeCanceledRenderIds;
};

const shortId = (id: string) => id.slice(0, 8);
const renderToastKey = (id: string, mode?: string, jobId?: string) =>
  jobId ? `job:${jobId}` : `${id}:${mode ?? "default"}`;
const captionToastKey = (id: string, mode?: string, jobId?: string) =>
  jobId ? `job:${jobId}` : `${id}:${mode ?? "default"}`;
const publishToastKey = (id: string, jobId?: string) =>
  jobId ? `job:${jobId}` : id;

const getRenderToastAliases = (payload: { id: string; mode?: string; jobId?: string }) => {
  const aliases = new Set<string>();
  aliases.add(`render:${renderToastKey(payload.id, payload.mode, payload.jobId)}`);
  aliases.add(`render:${payload.id}:${payload.mode ?? "default"}`);
  aliases.add(`render:${payload.id}:default`);
  return Array.from(aliases);
};


let globalToastSubscriptionsDetach: (() => void) | null = null;
let globalToastSubscriptionsRefCount = 0;
let globalStateSubscriptionsDetach: (() => void) | null = null;
let globalStateSubscriptionsRefCount = 0;
let globalSubscriptionSocket: Socket | null = null;

export function SocketIOProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const socket = useMemo(() => getBrowserSocket(), []);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected" | "error">(
    "connecting"
  );
  const [eventToken, setEventToken] = useState(0);
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);
  const registeredUserRef = useRef<string | null>(null);
  const registeredForSocketRef = useRef<string | null>(null);
  const socketIdRef = useRef<string | null>(null);
  const contentTitlesRef = useRef<Map<string, string>>(new Map());
  const titleFetchesRef = useRef<Map<string, Promise<string | null>>>(new Map());

  useEffect(() => {
    if (!socket) {
      return;
    }
    const handleUpdate = () => {
      setEventToken((current) => current + 1);
      queryClient.invalidateQueries({ queryKey: queryKeys.contentListBase });
    };

    const resolveContentLabel = async (id: string) => {
      const cached = contentTitlesRef.current.get(id);
      if (cached) {
        return cached;
      }
      const inflight = titleFetchesRef.current.get(id);
      if (inflight) {
        const resolved = await inflight;
        return resolved ?? `#${shortId(id)}`;
      }
      const request = sdk.content
        .get(id)
        .then((item) => {
          const title = item.title?.trim();
          if (title) {
            contentTitlesRef.current.set(id, title);
            return title;
          }
          return null;
        })
        .catch(() => null)
        .finally(() => {
          titleFetchesRef.current.delete(id);
        });
      titleFetchesRef.current.set(id, request);
      const resolved = await request;
      return resolved ?? `#${shortId(id)}`;
    };

    const notifyStarted = async (key: string, label: string, id: string, mode?: string) => {
      const started = getStartedKeys();
      if (started?.has(key)) return;
      started?.add(key);
      const modeSuffix = mode ? ` · ${mode}` : "";
      const contentLabel = await resolveContentLabel(id);
      toast.message(`${label} started · ${contentLabel}${modeSuffix}`);
    };

    const notifyQueued = async (key: string, label: string, id: string, mode?: string) => {
      const started = getStartedKeys();
      if (started?.has(key)) return;
      started?.add(key);
      const modeSuffix = mode ? ` · ${mode}` : "";
      const contentLabel = await resolveContentLabel(id);
      toast.message(`${label} queued · ${contentLabel}${modeSuffix}`);
    };

    const notifyCompleted = async (key: string, label: string, id: string, mode?: string) => {
      const completed = getCompletedKeys();
      if (completed?.has(key)) return;
      completed?.add(key);
      const modeSuffix = mode ? ` · ${mode}` : "";
      const contentLabel = await resolveContentLabel(id);
      const message = `${contentLabel}${modeSuffix}`;
      toast.success(message);
      notifyOSAppEvent(`${label} complete`, message);
      const audio = new Audio(COMPLETION_SOUND_SRC);
      void audio.play().catch(() => undefined);
    };

    const registerUser = async () => {
      try {
        const payload = await sdk.user.profile();
        const userId = payload.id;
        if (!userId) return;
        registeredUserRef.current = userId;
        if (
          registeredForSocketRef.current === userId &&
          socketIdRef.current === socket.id
        ) {
          return;
        }
        socket.emit(SocketEvents.userRegister, { userId });
        registeredForSocketRef.current = userId;
        socketIdRef.current = socket.id ?? null;
      } catch {
        // Ignore registration failures; socket will still connect.
      }
    };

    const handleConnect = () => {
      setConnected(true);
      setStatus("connected");
      void registerUser();
    };

    const handleDisconnect = () => {
      setConnected(false);
      setStatus("disconnected");
    };

    const handleConnectError = () => {
      setConnected(false);
      setStatus("error");
    };

    const invalidateContent = () => {
      handleUpdate();
    };

    const invalidatePublishes = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.publishesBase });
      queryClient.invalidateQueries({ queryKey: queryKeys.contentListBase });
    };

    const invalidateSettings = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    };

    const invalidateProfile = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      queryClient.invalidateQueries({ queryKey: queryKeys.profileConnections });
    };

    const handleRenderProgressToast = (payload: {
      id: string;
      jobId?: string;
      mode?: string;
      progress?: number;
      rendered?: number;
      total?: number;
    }) => {
      const key = renderToastKey(payload.id, payload.mode, payload.jobId);
      const canceledRenderKeys = getCanceledRenderKeys();
      const canceledRenderIds = getCanceledRenderIds();
      if (canceledRenderKeys?.has(key) || canceledRenderIds?.has(payload.id)) {
        return;
      }
      const progressValue = Number.isFinite(payload.progress ?? NaN)
        ? Number(payload.progress)
        : 0;
      const normalizedProgress = progressValue > 1 ? progressValue / 100 : progressValue;
      const rendered = Number.isFinite(payload.rendered ?? NaN)
        ? Number(payload.rendered)
        : null;
      const total = Number.isFinite(payload.total ?? NaN) ? Number(payload.total) : null;
      const isCompleted =
        normalizedProgress >= 1 ||
        (rendered !== null && total !== null && total > 0 && rendered >= total);
      if (isCompleted) {
        void notifyCompleted(`render:${key}`, "Render", payload.id, payload.mode);
        return;
      }
      if (normalizedProgress > 0 && normalizedProgress <= 0.02) {
        void notifyStarted(`render:${key}`, "Render", payload.id, payload.mode);
      }
    };

    const handleRenderCompleteToast = (payload: {
      id?: string;
      jobId?: string;
      mode?: string;
    }) => {
      if (!payload.id) return;
      const key = renderToastKey(payload.id, payload.mode, payload.jobId);
      const canceledRenderKeys = getCanceledRenderKeys();
      const canceledRenderIds = getCanceledRenderIds();
      if (canceledRenderKeys?.has(key) || canceledRenderIds?.has(payload.id)) {
        return;
      }
      void notifyCompleted(`render:${key}`, "Render", payload.id, payload.mode);
    };

    const handlePublishUpdateToast = (payload: {
      id: string;
      jobId?: string;
      status?: string;
    }) => {
      const key = publishToastKey(payload.id, payload.jobId);
      if (payload.status === "publishing") {
        void notifyStarted(`publish:${key}`, "Publish", payload.id);
      } else if (payload.status === "published" || payload.status === "published_with_warning") {
        void notifyCompleted(`publish:${key}`, "Publish", payload.id);
      }
    };

    const handleCaptionUpdateToast = (payload: {
      id: string;
      jobId?: string;
      mode?: string;
      status?: "queued" | "processing" | "completed" | "failed";
    }) => {
      const key = captionToastKey(payload.id, payload.mode, payload.jobId);
      if (payload.status === "queued") {
        void notifyStarted(`caption:${key}`, "Captions", payload.id, payload.mode);
      } else if (payload.status === "completed") {
        void notifyCompleted(`caption:${key}`, "Captions", payload.id, payload.mode);
      }
    };

    const handleRenderCancelRequestedToast = (payload: {
      id: string;
      jobId?: string;
      mode?: string;
    }) => {
      const key = renderToastKey(payload.id, payload.mode, payload.jobId);
      const canceledRenderKeys = getCanceledRenderKeys();
      const canceledRenderIds = getCanceledRenderIds();
      canceledRenderKeys?.add(key);
      canceledRenderIds?.add(payload.id);
      const started = getStartedKeys();
      const toastKey = `render-cancel:${key}`;
      if (started?.has(toastKey)) return;
      started?.add(toastKey);
      const modeSuffix = payload.mode ? ` · ${payload.mode}` : "";
      void resolveContentLabel(payload.id).then((contentLabel) => {
        toast.message(`Render cancel requested · ${contentLabel}${modeSuffix}`);
      });
    };

    const handleRenderQueuedToast = (payload: { id?: string; jobId?: string; mode?: string }) => {
      if (!payload.id) return;
      const normalizedPayload = { id: payload.id, mode: payload.mode, jobId: payload.jobId };
      const aliases = getRenderToastAliases(normalizedPayload);
      const started = getStartedKeys();
      if (aliases.some((alias) => started?.has(alias))) {
        return;
      }
      const key = renderToastKey(payload.id, payload.mode, payload.jobId);
      aliases
        .filter((alias) => alias !== `render:${key}`)
        .forEach((alias) => started?.add(alias));
      const canceledRenderKeys = getCanceledRenderKeys();
      const canceledRenderIds = getCanceledRenderIds();
      canceledRenderKeys?.delete(key);
      canceledRenderIds?.delete(payload.id);
      void notifyQueued(`render:${key}`, "Render", payload.id, payload.mode);
    };

    const handleRenderStartedToast = (payload: { id?: string; jobId?: string; mode?: string }) => {
      if (!payload.id) return;
      const normalizedPayload = { id: payload.id, mode: payload.mode, jobId: payload.jobId };
      const aliases = getRenderToastAliases(normalizedPayload);
      const started = getStartedKeys();
      if (aliases.some((alias) => started?.has(alias))) {
        return;
      }
      const key = renderToastKey(payload.id, payload.mode, payload.jobId);
      aliases
        .filter((alias) => alias !== `render:${key}`)
        .forEach((alias) => started?.add(alias));
      const canceledRenderKeys = getCanceledRenderKeys();
      const canceledRenderIds = getCanceledRenderIds();
      canceledRenderKeys?.delete(key);
      canceledRenderIds?.delete(payload.id);
      void notifyStarted(`render:${key}`, "Render", payload.id, payload.mode);
    };

    const handleRenderFailedToast = (payload: {
      id?: string;
      jobId?: string;
      mode?: string;
      error?: string;
    }) => {
      if (!payload.id) return;
      const key = renderToastKey(payload.id, payload.mode, payload.jobId);
      const canceledRenderKeys = getCanceledRenderKeys();
      const canceledRenderIds = getCanceledRenderIds();
      canceledRenderKeys?.delete(key);
      canceledRenderIds?.delete(payload.id);
      const completed = getCompletedKeys();
      const toastKey = `render-failed:${key}`;
      if (completed?.has(toastKey)) return;
      completed?.add(toastKey);
      void resolveContentLabel(payload.id).then((contentLabel) => {
        const modeSuffix = payload.mode ? ` · ${payload.mode}` : "";
        const reason = payload.error ? ` (${payload.error})` : "";
        toast.error(`Render failed · ${contentLabel}${modeSuffix}${reason}`);
      });
    };

    const handlePublishQueuedToast = (payload: {
      id: string;
      jobId?: string;
    }) => {
      handlePublishUpdateToast({ ...payload, status: "queued" });
    };

    const handlePublishStartedToast = (payload: {
      id: string;
      jobId?: string;
    }) => {
      handlePublishUpdateToast({ ...payload, status: "publishing" });
    };

    const handlePublishCompletedToast = (payload: {
      id: string;
      jobId?: string;
    }) => {
      handlePublishUpdateToast({ ...payload, status: "published" });
    };

    const handlePublishFailedToast = (payload: {
      id: string;
      jobId?: string;
      error?: string;
    }) => {
      const key = publishToastKey(payload.id, payload.jobId);
      const completed = getCompletedKeys();
      const toastKey = `publish-failed:${key}`;
      if (completed?.has(toastKey)) return;
      completed?.add(toastKey);
      void resolveContentLabel(payload.id).then((contentLabel) => {
        const reason = payload.error ? ` (${payload.error})` : "";
        toast.error(`Publish failed · ${contentLabel}${reason}`);
      });
    };

    const handleCaptionQueuedToast = (payload: { id: string; jobId?: string; mode?: string }) => {
      handleCaptionUpdateToast({ ...payload, status: "queued" });
    };

    const handleCaptionStartedToast = (payload: { id: string; jobId?: string; mode?: string }) => {
      handleCaptionUpdateToast({ ...payload, status: "processing" });
    };

    const handleCaptionCompletedToast = (payload: { id: string; jobId?: string; mode?: string }) => {
      handleCaptionUpdateToast({ ...payload, status: "completed" });
    };

    const handleCaptionFailedToast = (payload: {
      id?: string;
      jobId?: string;
      mode?: string;
      error?: string;
    }) => {
      if (!payload.id) return;
      const key = captionToastKey(payload.id, payload.mode, payload.jobId);
      const completed = getCompletedKeys();
      const toastKey = `caption-failed:${key}`;
      if (completed?.has(toastKey)) return;
      completed?.add(toastKey);
      void resolveContentLabel(payload.id).then((contentLabel) => {
        const modeSuffix = payload.mode ? ` · ${payload.mode}` : "";
        const reason = payload.error ? ` (${payload.error})` : "";
        toast.error(`Captions failed · ${contentLabel}${modeSuffix}${reason}`);
      });
    };

    const handleMetricsUpdate = (payload: MetricsPayload) => {
      setMetrics(payload);
    };

    const stateSubscriptions = [
      { event: SocketEvents.connect, handler: handleConnect },
      { event: SocketEvents.disconnect, handler: handleDisconnect },
      { event: SocketEvents.connectError, handler: handleConnectError },
      { event: SocketEvents.content.update, handler: invalidateContent },
      { event: SocketEvents.content.created, handler: invalidateContent },
      { event: SocketEvents.content.updated, handler: invalidateContent },
      { event: SocketEvents.content.deleted, handler: invalidateContent },
      { event: SocketEvents.content.statusChanged, handler: invalidateContent },
      { event: SocketEvents.publish.update, handler: invalidatePublishes },
      { event: SocketEvents.publish.queued, handler: invalidatePublishes },
      { event: SocketEvents.publish.started, handler: invalidatePublishes },
      { event: SocketEvents.publish.completed, handler: invalidatePublishes },
      { event: SocketEvents.publish.failed, handler: invalidatePublishes },
      { event: SocketEvents.settings.updated, handler: invalidateSettings },
      { event: SocketEvents.userProfile.updated, handler: invalidateProfile },
      { event: SocketEvents.providerConnection.created, handler: invalidateProfile },
      { event: SocketEvents.providerConnection.deleted, handler: invalidateProfile },
      { event: SocketEvents.metricsUpdate, handler: handleMetricsUpdate },
    ] as const;

    const toastSubscriptions = [
      { event: SocketEvents.render.queued, handler: handleRenderQueuedToast },
      { event: SocketEvents.render.started, handler: handleRenderStartedToast },
      { event: SocketEvents.render.progress, handler: handleRenderProgressToast },
      { event: SocketEvents.render.completed, handler: handleRenderCompleteToast },
      { event: SocketEvents.render.failed, handler: handleRenderFailedToast },
      { event: SocketEvents.publish.update, handler: handlePublishUpdateToast },
      { event: SocketEvents.publish.queued, handler: handlePublishQueuedToast },
      { event: SocketEvents.publish.started, handler: handlePublishStartedToast },
      { event: SocketEvents.publish.completed, handler: handlePublishCompletedToast },
      { event: SocketEvents.publish.failed, handler: handlePublishFailedToast },
      { event: SocketEvents.caption.update, handler: handleCaptionUpdateToast },
      { event: SocketEvents.caption.queued, handler: handleCaptionQueuedToast },
      { event: SocketEvents.caption.started, handler: handleCaptionStartedToast },
      { event: SocketEvents.caption.completed, handler: handleCaptionCompletedToast },
      { event: SocketEvents.caption.failed, handler: handleCaptionFailedToast },
      { event: SocketEvents.render.cancelRequested, handler: handleRenderCancelRequestedToast },
    ] as const;
    if (globalSubscriptionSocket && globalSubscriptionSocket !== socket) {
      globalStateSubscriptionsDetach?.();
      globalToastSubscriptionsDetach?.();
      globalStateSubscriptionsDetach = null;
      globalToastSubscriptionsDetach = null;
      globalStateSubscriptionsRefCount = 0;
      globalToastSubscriptionsRefCount = 0;
      globalSubscriptionSocket = null;
    }

    globalSubscriptionSocket = socket;
    globalStateSubscriptionsRefCount += 1;
    globalToastSubscriptionsRefCount += 1;

    if (!globalStateSubscriptionsDetach) {
      globalStateSubscriptionsDetach = attachSocketSubscriptions(socket, stateSubscriptions);
    }
    if (!globalToastSubscriptionsDetach) {
      globalToastSubscriptionsDetach = attachSocketSubscriptions(socket, toastSubscriptions);
    }

    return () => {
      globalStateSubscriptionsRefCount -= 1;
      globalToastSubscriptionsRefCount -= 1;

      if (globalStateSubscriptionsRefCount <= 0) {
        globalStateSubscriptionsRefCount = 0;
        globalStateSubscriptionsDetach?.();
        globalStateSubscriptionsDetach = null;
      }
      if (globalToastSubscriptionsRefCount <= 0) {
        globalToastSubscriptionsRefCount = 0;
        globalToastSubscriptionsDetach?.();
        globalToastSubscriptionsDetach = null;
      }
      if (
        globalStateSubscriptionsRefCount === 0 &&
        globalToastSubscriptionsRefCount === 0
      ) {
        globalSubscriptionSocket = null;
      }
    };

  }, [queryClient, socket]);

  const value = useMemo(
    () => ({ connected, status, eventToken, socket }),
    [connected, status, eventToken, socket]
  );

  return (
    <SocketIOContext.Provider value={value}>
      <MetricsContext.Provider value={metrics}>
        {children}
      </MetricsContext.Provider>
    </SocketIOContext.Provider>
  );
}

export function useSocketIO() {
  const context = useContext(SocketIOContext);
  if (!context) {
    throw new Error("useSocketIO must be used within SocketIOProvider.");
  }
  return context;
}

export function useOptionalSocketIO() {
  return useContext(SocketIOContext);
}

export function useSocketMetrics() {
  return useContext(MetricsContext);
}
