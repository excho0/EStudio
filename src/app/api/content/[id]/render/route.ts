import { spawn } from "child_process";
import path from "path";
import { pathToFileURL } from "url";
import { NextResponse } from "next/server";
import {
  contentPaths,
  ensureContentStore,
  getContentItem,
  updateContentItem,
} from "@/lib/content-store";
import { emitContentUpdate } from "@/lib/socket";

export const runtime = "nodejs";

const runRender = (args: string[]) =>
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
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      output += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Render failed with code ${code}\n${output}`));
      }
    });
  });

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const props = {
    title: item.title,
    videoSrc: pathToFileURL(
      path.join(contentPaths.baseDir, item.videoPath)
    ).toString(),
    audioSrc: pathToFileURL(
      path.join(contentPaths.baseDir, item.songPath)
    ).toString(),
    segmentDurationSeconds: item.segmentDurationSeconds,
    fadeDurationSeconds: item.fadeDurationSeconds,
    videoDurationSeconds: item.videoDurationSeconds ?? item.segmentDurationSeconds,
    songDurationSeconds: item.songDurationSeconds,
    fps: item.fps,
    width: item.width,
    height: item.height,
  };

  try {
    await runRender([
      entryPoint,
      "ContentLoop",
      outputPath,
      "--props",
      JSON.stringify(props),
      "--overwrite",
      "--log=verbose",
    ]);

    const updated = await updateContentItem(id, {
      status: "rendered",
      renderPath,
    });
    emitContentUpdate({ type: "content:status", id, status: "rendered" });

    return NextResponse.json(updated);
  } catch (error) {
    await updateContentItem(id, { status: "failed" });
    emitContentUpdate({ type: "content:status", id, status: "failed" });
    const message =
      error instanceof Error ? error.message : "Render failed";
    const trimmed =
      message.length > 6000 ? `${message.slice(0, 6000)}...` : message;
    return NextResponse.json(
      { error: trimmed },
      { status: 500 }
    );
  }
}
