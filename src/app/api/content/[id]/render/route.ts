import { spawn } from "child_process";
import path from "path";
import { NextResponse } from "next/server";
import {
  contentPaths,
  ensureContentStore,
} from "@/lib/content-store";
import { emitContentUpdate, emitRenderProgress } from "@/lib/socket";
import { getContentItem, updateContentItem } from "@/lib/data/content";

export const runtime = "nodejs";

const runRender = (args: string[], onLog?: (text: string) => void) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["exec", "--", "remotion", "render", ...args],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let output = "";
    const handleStdout = (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
      onLog?.(text);
    };
    const handleStderr = (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
      onLog?.(text);
    };

    child.stdout?.on("data", handleStdout);
    child.stderr?.on("data", handleStderr);

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Render failed with code ${code}\n${output}`));
      }
    });
  });

type RenderJob = {
  id: string;
  args: string[];
  renderPath: string;
  totalFrames: number;
  browserLabel: string;
  chromeMode: string;
};

const startRenderJob = async ({
  id,
  args,
  renderPath,
  totalFrames,
  browserLabel,
  chromeMode,
}: RenderJob) => {
  emitRenderProgress({
    id,
    rendered: 0,
    total: totalFrames,
    progress: 0,
  });

  let buffer = "";
  let lastRendered = -1;
  const progressRegex = /Rendered\s+(\d+)\/(\d+),\s+time remaining:\s+(.+)/;

  const handleLog = (text: string) => {
    buffer += text;
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      const match = progressRegex.exec(line);
      if (match) {
        const rendered = Number(match[1]);
        const total = Number(match[2]);
        if (Number.isFinite(rendered) && Number.isFinite(total)) {
          if (rendered !== lastRendered) {
            lastRendered = rendered;
            emitRenderProgress({
              id,
              rendered,
              total,
              progress: total ? rendered / total : 0,
              eta: match[3],
            });
          }
        }
      }
      index = buffer.indexOf("\n");
    }
  };

  try {
    await runRender(args, handleLog);

    const updated = await updateContentItem(id, {
      status: "rendered",
      renderPath,
    });
    emitContentUpdate({ type: "content:status", id, status: "rendered" });
    emitContentUpdate({ type: "content:rendered", id, item: updated });
  } catch (error) {
    await updateContentItem(id, { status: "failed" });
    emitContentUpdate({ type: "content:status", id, status: "failed" });
    const message = error instanceof Error ? error.message : "Render failed";
    console.error(
      `Render job failed for ${id} (browser=${browserLabel}, mode=${chromeMode}):`,
      message
    );
  }
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resolvedBrowser =
    process.env.REMOTION_RENDER_BROWSER_EXECUTABLE ||
    process.env.REMOTION_BROWSER_EXECUTABLE ||
    null;
  const chromeMode = process.env.REMOTION_RENDER_CHROME_MODE || "chrome-for-testing";
  const item = await getContentItem(id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await ensureContentStore();
  await updateContentItem(id, { status: "rendering" });
  emitContentUpdate({ type: "content:status", id, status: "rendering" });

  const outputFileName = `${id}.mp4`;
  const outputPath = path.join(contentPaths.rendersDir, outputFileName);
  const renderPath = path.relative(contentPaths.baseDir, outputPath);
  const entryPoint = path.join(process.cwd(), "src", "remotion", "index.tsx");

  const origin = new URL(request.url).origin;
  const totalFrames = Math.max(1, Math.round(item.songDurationSeconds * item.fps));
  const props = {
    title: item.title,
    videoSrc: `${origin}/api/content/${id}/asset?type=video`,
    audioSrc: `${origin}/api/content/${id}/asset?type=song`,
    segmentDurationSeconds: item.segmentDurationSeconds,
    fadeDurationSeconds: item.fadeDurationSeconds,
    videoDurationSeconds: item.videoDurationSeconds ?? item.segmentDurationSeconds,
    overlapRatio: item.overlapRatio ?? null,
    playbackRate: item.playbackRate ?? 1,
    songDurationSeconds: item.songDurationSeconds,
    fps: item.fps,
    width: item.width,
    height: item.height,
  };

  const args = [
    entryPoint,
    "ContentLoop",
    outputPath,
    "--props",
    JSON.stringify(props),
    "--overwrite",
    "--log=info",
    `--chrome-mode=${chromeMode}`,
    "--gl=vulkan",
  ];

  if (process.env.REMOTION_RENDER_BROWSER_ARGS) {
    args.push("--browser-args", process.env.REMOTION_RENDER_BROWSER_ARGS);
  }

  if (resolvedBrowser) {
    args.push("--browser-executable", resolvedBrowser);
  }

  const browserLabel = resolvedBrowser ?? "auto";
  void startRenderJob({
    id,
    args,
    renderPath,
    totalFrames,
    browserLabel,
    chromeMode,
  });

  return NextResponse.json(
    {
      ok: true,
      status: "rendering",
      id,
      browser: browserLabel,
      chromeMode,
    },
    { status: 202 }
  );
}
