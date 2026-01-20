import "dotenv/config";
import { createServer } from "http";
import { execFile } from "child_process";
import next from "next";
import { Server } from "socket.io";
import si from "systeminformation";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 3000);
const app = next({ dev, hostname: "0.0.0.0", port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const httpServer = createServer((req, res) => {
      handle(req, res);
    });

    const io = new Server(httpServer, {
      path: "/api/socket",
      addTrailingSlash: false,
    });

    globalThis.io = io;

    const readNvidiaSmi = () =>
      new Promise((resolve) => {
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
      new Promise((resolve) => {
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
              const entries = Object.values(parsed).map((entry) => {
                const usage = Number(entry["GPU use (%)"] ?? entry["GPU use"] ?? NaN);
                const temp = Number(entry["Temperature (Sensor junction) (C)"] ?? entry["Temperature (Sensor edge) (C)"] ?? NaN);
                const vramUsed = Number(entry["VRAM Total Used (B)"] ?? NaN);
                const vramTotal = Number(entry["VRAM Total (B)"] ?? NaN);
                const fanSpeed = Number(entry["Fan speed (%)"] ?? entry["Fan Speed (%)"] ?? NaN);
                const powerDraw = Number(entry["Average Graphics Package Power (W)"] ?? entry["Average Graphics Package Power"] ?? NaN);
                return {
                  model: entry["Card series"] ?? "AMD GPU",
                  utilizationGpu: Number.isFinite(usage) ? usage : null,
                  temperatureGpu: Number.isFinite(temp) ? temp : null,
                  vramUsedMB: Number.isFinite(vramUsed) ? Math.round(vramUsed / (1024 * 1024)) : null,
                  vramTotalMB: Number.isFinite(vramTotal) ? Math.round(vramTotal / (1024 * 1024)) : null,
                  fanSpeedPct: Number.isFinite(fanSpeed) ? fanSpeed : null,
                  powerDrawW: Number.isFinite(powerDraw) ? powerDraw : null,
                };
              });
              resolve(entries);
            } catch {
              resolve(null);
            }
          }
        );
      });

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

        const gpus = graphics.controllers.map((gpu, index) => {
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
            fanSpeedPct: nvidia?.fanSpeedPct ?? amd?.fanSpeedPct ?? null,
            powerDrawW: nvidia?.powerDrawW ?? amd?.powerDrawW ?? null,
            powerLimitW: nvidia?.powerLimitW ?? amd?.powerLimitW ?? null,
          };
        });

        io.emit("metrics:update", {
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
        console.warn("metrics:update failed", error);
      }
    };

    emitMetrics();
    setInterval(emitMetrics, 2000);

    io.on("connection", (socket) => {
      socket.emit("content:update", { type: "connected" });
    });

    httpServer.listen(port, () => {
      console.log(`> Ready on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server", error);
    process.exit(1);
  });
