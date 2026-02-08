import { spawn } from "child_process";
import type { ChildProcess } from "child_process";

const modeArg =
  process.argv.find((arg) => arg.startsWith("--mode="))?.split("=")[1] ||
  process.argv[2] ||
  "api+worker";

const mode = modeArg.toLowerCase();

const validModes = new Set(["api+worker", "worker", "api"]);
if (!validModes.has(mode)) {
  console.error(`Invalid mode "${mode}". Use: api+worker | worker | api`);
  process.exit(1);
}

type RuntimeChild = {
  name: string;
  child: ChildProcess;
};

const children: RuntimeChild[] = [];
const hasRedisForWorkers =
  Boolean(process.env.REDIS_URL?.trim()) ||
  Boolean(process.env.RENDER_QUEUE_REDIS_URL?.trim()) ||
  Boolean(process.env.PUBLISH_QUEUE_REDIS_URL?.trim());

const spawnProc = (
  name: string,
  cmd: string,
  args: string[],
  env: Record<string, string> = {}
) => {
  const child = spawn(cmd, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  children.push({ name, child });
  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`[runtime] ${name} exited via signal ${signal}`);
    } else {
      console.log(`[runtime] ${name} exited code=${code}`);
    }
  });
  return child;
};

if (mode === "api+worker" || mode === "api") {
  spawnProc("api", "pnpm", ["tsx", "src/runtime/server.ts"]);
}

if (mode === "api+worker" || mode === "worker") {
  if (hasRedisForWorkers) {
    spawnProc("worker", "pnpm", ["tsx", "src/runtime/worker.ts"]);
  } else if (mode === "worker") {
    console.error(
      "[runtime] worker mode requires REDIS_URL or queue-specific Redis URLs"
    );
    process.exit(1);
  } else {
    console.warn(
      "[runtime] skipping worker: no REDIS_URL/RENDER_QUEUE_REDIS_URL/PUBLISH_QUEUE_REDIS_URL"
    );
  }
}

const shutdown = (signal: NodeJS.Signals) => {
  for (const { child } of children) {
    try {
      child.kill(signal);
    } catch {
      // ignore
    }
  }
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
