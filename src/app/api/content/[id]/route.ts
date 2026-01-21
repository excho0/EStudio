import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import {
  contentPaths,
  resolveContentPath,
} from "@/lib/content-store";
import { emitContentUpdate } from "@/lib/socket";
import {
  deleteContentItem,
  getContentItem,
  updateContentItem,
} from "@/lib/data/content";

export const runtime = "nodejs";

const safeUnlink = async (relativePath?: string | null) => {
  if (!relativePath) return;
  const absolutePath = resolveContentPath(relativePath);
  await fs.rm(absolutePath, { force: true });
};

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = await getContentItem(id);

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(item);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contentType = request.headers.get("content-type") ?? "";
  const isMultipart = contentType.includes("multipart/form-data");
  const item = await getContentItem(id);

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let payload: Record<string, unknown> = {};

  if (isMultipart) {
    const formData = await request.formData();
    const title = formData.get("title");
    const status = formData.get("status");
    const fadeDurationSeconds = formData.get("fadeDurationSeconds");
    const playbackRate = formData.get("playbackRate");
    const fps = formData.get("fps");
    const width = formData.get("width");
    const height = formData.get("height");
    const overlapRatio = formData.get("overlapRatio");
    const thumbnail = formData.get("thumbnail");

    const toOptionalNumber = (value: FormDataEntryValue | null) => {
      if (value === null) return undefined;
      const parsed = Number(String(value));
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    if (typeof title === "string" && title.trim()) {
      payload.title = title.trim();
    }
    if (typeof status === "string" && status.trim()) {
      payload.status = status.trim();
    }
    const fadeValue = toOptionalNumber(fadeDurationSeconds);
    if (fadeValue !== undefined) {
      payload.fadeDurationSeconds = fadeValue;
    }
    const playbackValue = toOptionalNumber(playbackRate);
    if (playbackValue !== undefined) {
      payload.playbackRate = playbackValue;
    }
    const fpsValue = toOptionalNumber(fps);
    if (fpsValue !== undefined) {
      payload.fps = fpsValue;
    }
    const widthValue = toOptionalNumber(width);
    if (widthValue !== undefined) {
      payload.width = widthValue;
    }
    const heightValue = toOptionalNumber(height);
    if (heightValue !== undefined) {
      payload.height = heightValue;
    }
    const overlapValue = toOptionalNumber(overlapRatio);
    if (overlapValue !== undefined) {
      payload.overlapRatio = Math.min(0.9, Math.max(0, overlapValue));
    }

    if (thumbnail instanceof File) {
      const thumbnailPath = await writeUpload(thumbnail, "uploads/thumbnails");
      payload.thumbnailPath = thumbnailPath;
      await safeUnlink(item.thumbnailPath);
    }
  } else {
    payload = await request.json();
  }

  const updated = await updateContentItem(id, payload);

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  emitContentUpdate({ type: "content:updated", id });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = await getContentItem(id);

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await Promise.all([
    safeUnlink(item.thumbnailPath),
    safeUnlink(item.videoPath),
    safeUnlink(item.songPath),
    safeUnlink(item.renderPath ?? undefined),
  ]);

  await deleteContentItem(id);

  emitContentUpdate({ type: "content:deleted", id });

  return NextResponse.json({ ok: true });
}
