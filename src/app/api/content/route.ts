import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import {
  addContentItem,
  contentPaths,
  ensureContentStore,
  readContentIndex,
} from "@/lib/content-store";
import { emitContentUpdate } from "@/lib/socket";

export const runtime = "nodejs";

const writeUpload = async (file: File, folder: string) => {
  const extension = path.extname(file.name || "");
  const id = randomUUID();
  const fileName = `${id}${extension || ""}`;
  const targetDir = path.join(contentPaths.baseDir, folder);
  const targetPath = path.join(targetDir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());

  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(targetPath, buffer);

  return path.relative(contentPaths.baseDir, targetPath);
};

export async function GET() {
  const index = await readContentIndex();
  return NextResponse.json(index);
}

export async function POST(request: Request) {
  await ensureContentStore();
  const formData = await request.formData();

  const title = String(formData.get("title") ?? "Untitled");
  const thumbnail = formData.get("thumbnail");
  const video = formData.get("video");
  const song = formData.get("song");

  if (!(thumbnail instanceof File) || !(video instanceof File) || !(song instanceof File)) {
    return NextResponse.json(
      { error: "Missing thumbnail, video, or song file." },
      { status: 400 }
    );
  }

  const songDurationSeconds = Number(formData.get("songDurationSeconds") ?? 0);
  const videoDurationSeconds = Number(formData.get("videoDurationSeconds") ?? 0);
  const segmentDurationSeconds = Number(formData.get("segmentDurationSeconds") ?? 4);
  const fadeDurationSeconds = Number(formData.get("fadeDurationSeconds") ?? 1);
  const fps = Number(formData.get("fps") ?? 30);
  const width = Number(formData.get("width") ?? 1280);
  const height = Number(formData.get("height") ?? 720);

  const [thumbnailPath, videoPath, songPath] = await Promise.all([
    writeUpload(thumbnail, "uploads/thumbnails"),
    writeUpload(video, "uploads/videos"),
    writeUpload(song, "uploads/songs"),
  ]);

  const item = {
    id: randomUUID(),
    title,
    createdAt: new Date().toISOString(),
    thumbnailPath,
    videoPath,
    songPath,
    status: "uploaded",
    songDurationSeconds: Number.isFinite(songDurationSeconds)
      ? songDurationSeconds
      : 0,
    segmentDurationSeconds: Number.isFinite(segmentDurationSeconds)
      ? segmentDurationSeconds
      : 4,
    videoDurationSeconds: Number.isFinite(videoDurationSeconds)
      ? videoDurationSeconds
      : Number.isFinite(segmentDurationSeconds)
        ? segmentDurationSeconds
        : 0,
    fadeDurationSeconds: Number.isFinite(fadeDurationSeconds)
      ? fadeDurationSeconds
      : 1,
    fps: Number.isFinite(fps) ? fps : 30,
    width: Number.isFinite(width) ? width : 1280,
    height: Number.isFinite(height) ? height : 720,
  };

  await addContentItem(item);
  emitContentUpdate({ type: "content:created", item });
  return NextResponse.json(item);
}
