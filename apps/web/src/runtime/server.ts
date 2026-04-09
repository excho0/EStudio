import "dotenv/config";
import { createServer } from "http";
import { execFile } from "child_process";
import next from "next";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import si from "systeminformation";
import { getLogger } from "@/lib/logging";
import { resolveRedisPoolUrl } from "@/lib/redis/pools";
import { eventBus } from "@/lib/event-bus";
import { APP_EVENT_TOPICS, SocketEvents } from "@/lib/socket/events";

declare global {
  // Shared Socket.IO instance for legacy modules that still access global state.
  var io: Server | undefined;
}

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 3000);
const app = next({ dev, hostname: "0.0.0.0", port });
const handle = app.getRequestHandler();
let mockFanStep = 0;
let mockFanDir = 1;
const logger = getLogger("runtime-server");

type NvidiaSmiEntry = {
  model: string;
  utilizationGpu: number;
  vramTotalMB: number;
  vramUsedMB: number;
  temperatureGpu: number;
  fanSpeedPct: number;
  powerDrawW: number;
  powerLimitW: number;
};

type RocmSmiEntry = {
  model: string;
  utilizationGpu: number | null;
  temperatureGpu: number | null;
  vramUsedMB: number | null;
  vramTotalMB: number | null;
  fanSpeedPct: number | null;
  powerDrawW: number | null;
  powerLimitW: number | null;
};

type GraphicsControllerWithVram = {
  model?: string;
  vendor?: string;
  bus?: string;
  utilizationGpu?: number | null;
  temperatureGpu?: number | null;
  vramTotal?: number;
  vramUsed?: number;
};

app
  .prepare()
  .then(async () => {
    const httpServer = createServer((req, res) => {
      handle(req, res);
    });

    const io = new Server(httpServer, {
      path: "/api/socket",
      addTrailingSlash: false,
    });

    const socketRedisUrl = resolveRedisPoolUrl("socket-io");
    if (socketRedisUrl) {
      try {
        const pubClient = createClient({
          url: socketRedisUrl,
          socket: { reconnectStrategy: (retries) => Math.min(1000 * retries, 10_000) },
        });
        const subClient = pubClient.duplicate();
        pubClient.on("error", (error) => {
          logger.warn({ error }, "Socket.IO redis publisher client error.");
        });
        subClient.on("error", (error) => {
          logger.warn({ error }, "Socket.IO redis subscriber client error.");
        });
        await Promise.all([pubClient.connect(), subClient.connect()]);
        io.adapter(createAdapter(pubClient, subClient));
        logger.info("Socket.IO redis adapter enabled.");
      } catch (error) {
        logger.warn(
          { error },
          "Socket.IO redis adapter disabled. Falling back to in-memory adapter."
        );
      }
    } else {
      logger.info(
        "Socket.IO redis adapter skipped (no REDIS_URL/SOCKET_IO_REDIS_URL)."
      );
    }

    globalThis.io = io;

    const resolveUserRoom = (userId?: string | null) => (userId ? `user:${userId}` : null);

    const extractUserId = (payload: unknown) => {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return null;
      }
      const value = (payload as { userId?: unknown }).userId;
      return typeof value === "string" && value.length > 0 ? value : null;
    };

    const registerRealtimeBridge = async () => {
      const unsubs = await Promise.all(
        APP_EVENT_TOPICS.map((topic: keyof import("@/types").AppEventMap) =>
          eventBus.on(topic, ({ payload }) => {
            const room = resolveUserRoom(extractUserId(payload));
            if (room) {
              io.to(room).emit(topic, payload);
              return;
            }
            io.emit(topic, payload);
          })
        )
      );

      const stop = async () => {
        await Promise.all(unsubs.map(async (unsubscribe) => unsubscribe().catch(() => undefined)));
      };
      return { stop };
    };

    const realtimeBridge = await registerRealtimeBridge();

    const readNvidiaSmi = () =>
      new Promise<NvidiaSmiEntry[] | null>((resolve) => {
        execFile(
          "nvidia-smi",
          [
            "--query-gpu=name,utilization.gpu,memory.total,memory.used,temperature.gpu,fan.speed,power.draw,power.limit",
            "--format=csv,noheader,nounits",
          ],
          { timeout: 1000 },
          (error, stdout) => {
            if (error || !stdout) {
              resolve(null);
              return;
            }
            const lines = stdout
              .trim()
              .split("\n")
              .map((line) => line.split(",").map((value) => value.trim()));
            const parsed = lines.map((columns) => ({
              model: columns[0] || "NVIDIA GPU",
              utilizationGpu: Number(columns[1]),
              vramTotalMB: Number(columns[2]),
              vramUsedMB: Number(columns[3]),
              temperatureGpu: Number(columns[4]),
              fanSpeedPct: Number(columns[5]),
              powerDrawW: Number(columns[6]),
              powerLimitW: Number(columns[7]),
            }));
            resolve(parsed);
          }
        );
      });

    const readRocmSmi = () =>
      new Promise<RocmSmiEntry[] | null>((resolve) => {
        execFile(
          "rocm-smi",
          ["--showuse", "--showmeminfo", "vram", "--showtemp", "--json"],
          { timeout: 1000 },
          (error, stdout) => {
            if (error || !stdout) {
              resolve(null);
              return;
            }
            try {
              const parsed = JSON.parse(stdout);
              const entries = Object.values(
                parsed as Record<string, Record<string, unknown>>
              ).map((entry) => {
                const usage = Number(entry["GPU use (%)"] ?? entry["GPU use"] ?? NaN);
                const temp = Number(entry["Temperature (Sensor junction) (C)"] ?? entry["Temperature (Sensor edge) (C)"] ?? NaN);
                const vramUsed = Number(entry["VRAM Total Used (B)"] ?? NaN);
                const vramTotal = Number(entry["VRAM Total (B)"] ?? NaN);
                const fanSpeed = Number(entry["Fan speed (%)"] ?? entry["Fan Speed (%)"] ?? NaN);
                const powerDraw = Number(entry["Average Graphics Package Power (W)"] ?? entry["Average Graphics Package Power"] ?? NaN);
                return {
                  model:
                    typeof entry["Card series"] === "string"
                      ? entry["Card series"]
                      : "AMD GPU",
                  utilizationGpu: Number.isFinite(usage) ? usage : null,
                  temperatureGpu: Number.isFinite(temp) ? temp : null,
                  vramUsedMB: Number.isFinite(vramUsed) ? Math.round(vramUsed / (1024 * 1024)) : null,
                  vramTotalMB: Number.isFinite(vramTotal) ? Math.round(vramTotal / (1024 * 1024)) : null,
                  fanSpeedPct: Number.isFinite(fanSpeed) ? fanSpeed : null,
                  powerDrawW: Number.isFinite(powerDraw) ? powerDraw : null,
                  powerLimitW: null,
                };
              });
              resolve(entries);
            } catch {
              resolve(null);
            }
          }
        );
      });

    let metricsSubscriberCount = 0;
    let metricsInterval: NodeJS.Timeout | null = null;
    const METRICS_ROOM = "metrics:subscribers";

    const emitMetrics = async () => {
      try {
        const [load, memory, graphics, cpuTemp, nvidiaSmi, rocmSmi] = await Promise.all([
          si.currentLoad(),
          si.mem(),
          si.graphics(),
          si.cpuTemperature(),
          readNvidiaSmi(),
          readRocmSmi(),
        ]);

        const ramUsedPct = memory.total
          ? (memory.active / memory.total) * 100
          : null;

          const useMockFan = process.env.MOCK_FAN_SPEED === "true";
          if (useMockFan) {
            mockFanStep = mockFanDir > 0 ? 50 : 0;
            mockFanDir *= -1;
          }

          const gpus = graphics.controllers.map((gpuRaw, index) => {
          const gpu = gpuRaw as GraphicsControllerWithVram;
          const vramTotalBytes = gpu.vramTotal ? gpu.vramTotal * 1024 * 1024 : 0;
          const vramUsedBytes = gpu.vramUsed ? gpu.vramUsed * 1024 * 1024 : 0;
          const vramPct =
            vramTotalBytes > 0 ? (vramUsedBytes / vramTotalBytes) * 100 : null;
          const nvidia =
            Array.isArray(nvidiaSmi) && nvidiaSmi[index] ? nvidiaSmi[index] : null;
          const isAmd =
            (gpu.vendor && gpu.vendor.toLowerCase().includes("amd")) ||
            (gpu.model && gpu.model.toLowerCase().includes("radeon"));
          const amd =
            isAmd && Array.isArray(rocmSmi) && rocmSmi[index] ? rocmSmi[index] : null;
          const vramTotalMB =
            gpu.vramTotal || nvidia?.vramTotalMB || amd?.vramTotalMB || null;
          const vramUsedMB =
            gpu.vramUsed || nvidia?.vramUsedMB || amd?.vramUsedMB || null;
          const nvidiaVramPct =
            vramTotalMB && vramUsedMB
              ? (vramUsedMB / vramTotalMB) * 100
              : null;

          return {
            model: gpu.model || nvidia?.model || amd?.model || "GPU",
            vendor: gpu.vendor || (nvidia ? "NVIDIA" : amd ? "AMD" : null),
            bus: gpu.bus || null,
            vramTotalMB,
            vramUsedMB,
            vramUsagePct: vramPct ?? nvidiaVramPct,
            utilizationGpu:
              gpu.utilizationGpu ?? nvidia?.utilizationGpu ?? amd?.utilizationGpu ?? null,
            temperatureGpu:
              gpu.temperatureGpu ?? nvidia?.temperatureGpu ?? amd?.temperatureGpu ?? null,
            fanSpeedPct: useMockFan
              ? mockFanStep
              : nvidia?.fanSpeedPct ?? amd?.fanSpeedPct ?? null,
            powerDrawW: nvidia?.powerDrawW ?? amd?.powerDrawW ?? null,
            powerLimitW: nvidia?.powerLimitW ?? amd?.powerLimitW ?? null,
          };
        });

        io.to(METRICS_ROOM).emit("metrics.update", {
          cpu: {
            load: load.currentLoad,
            temperature: cpuTemp.main ?? null,
          },
          memory: {
            usage: ramUsedPct,
            totalBytes: memory.total,
            usedBytes: memory.active,
          },
          gpus,
        });
      } catch (error) {
        logger.warn({ error }, "metrics:update failed.");
      }
    };

    const startMetricsMonitoring = () => {
      if (metricsInterval) return;
      void emitMetrics();
      metricsInterval = setInterval(() => {
        void emitMetrics();
      }, 2000);
    };

    const stopMetricsMonitoring = () => {
      if (!metricsInterval) return;
      clearInterval(metricsInterval);
      metricsInterval = null;
    };

    io.on("connection", (socket) => {
      socket.emit("content.update", { type: "connected" });
      socket.on(SocketEvents.user.register, (payload: unknown) => {
        const userId = (() => {
          if (typeof payload === "string") return payload;
          if (
            typeof payload === "object" &&
            payload !== null &&
            "userId" in payload &&
            typeof (payload as { userId?: unknown }).userId === "string"
          ) {
            return (payload as { userId: string }).userId;
          }
          return null;
        })();
        if (!userId || typeof userId !== "string") {
          return;
        }
        socket.join(`user:${userId}`);
      });

      const subscribeMetrics = () => {
        if (socket.data.metricsSubscribed === true) return;
        socket.data.metricsSubscribed = true;
        metricsSubscriberCount += 1;
        socket.join(METRICS_ROOM);
        startMetricsMonitoring();
      };

      const unsubscribeMetrics = () => {
        if (socket.data.metricsSubscribed !== true) return;
        socket.data.metricsSubscribed = false;
        metricsSubscriberCount = Math.max(0, metricsSubscriberCount - 1);
        socket.leave(METRICS_ROOM);
        if (metricsSubscriberCount === 0) {
          stopMetricsMonitoring();
        }
      };

      socket.on(SocketEvents.metrics.subscribe, subscribeMetrics);
      socket.on(SocketEvents.metrics.unsubscribe, unsubscribeMetrics);
      socket.on("disconnect", unsubscribeMetrics);
    });

    if (process.env.RENDER_SIMULATE === "true") {
      const simulateId = process.env.RENDER_SIMULATE_ID ?? "demo-render";
      const steps = [0, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1];
      let index = 0;
      let announcedRendered = false;
      setInterval(() => {
        const progress = steps[index % steps.length];
        io.emit("render.progress", {
          id: simulateId,
          rendered: Math.round(progress * 100),
          total: 100,
          progress,
        });
        if (progress >= 1 && !announcedRendered) {
          io.emit("content.update", {
            type: "content.status",
            id: simulateId,
            status: "rendered",
          });
          announcedRendered = true;
        }
        index += 1;
        if (index >= steps.length) {
          index = 0;
          announcedRendered = false;
        }
      }, 2000);
    }

    let shuttingDown = false;
    const shutdown = async (signal: "SIGINT" | "SIGTERM") => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info({ signal }, "Shutting down runtime server.");
      const forceExitTimer = setTimeout(() => {
        logger.warn({ signal }, "Graceful shutdown timed out. Exiting.");
        process.exit(1);
      }, 10_000);

      try {
        await realtimeBridge.stop();
        await new Promise<void>((resolve) => {
          io.close(() => resolve());
        });
        await new Promise<void>((resolve) => {
          httpServer.close(() => resolve());
        });
        clearTimeout(forceExitTimer);
        process.exit(0);
      } catch (error) {
        clearTimeout(forceExitTimer);
        logger.error({ error, signal }, "Failed during graceful shutdown.");
        process.exit(1);
      }
    };

    process.once("SIGINT", () => {
      void shutdown("SIGINT");
    });
    process.once("SIGTERM", () => {
      void shutdown("SIGTERM");
    });

    httpServer.listen(port, () => {
      logger.info({ port }, "Server ready.");
    });
  })
  .catch((error) => {
    logger.error({ error }, "Failed to start server.");
    process.exit(1);
  });
