import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import {
  ensureContentStore,
  getContentAssetPath,
  resolveContentPath,
  writeContentManifest,
} from "@/lib/content-store";
import { getPaletteFromPath } from "@/lib/color-palette";
import { emitContentUpdate } from "@/lib/socket";
import {
  contentCreateSchema,
  contentQuerySchema,
  createContentItem,
  listContentItems,
} from "@/lib/data/content";

export const runtime = "nodejs";

const writeUpload = async (file: File, id: string, kind: "thumbnail" | "video" | "song") => {
  const extension = path.extname(file.name || "");
  const relativePath = getContentAssetPath(id, kind, extension || ".bin");
  const targetPath = resolveContentPath(relativePath);
  const buffer = Buffer.from(await file.arrayBuffer());

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, buffer);

  return relativePath;
};

const finalizeDraft = async (
  draftPath: string,
  id: string,
  kind: "thumbnail" | "video" | "song"
) => {
  const absoluteDraft = resolveContentPath(draftPath);
  try {
    await fs.access(absoluteDraft);
  } catch {
    throw new Error(`Draft file missing for ${kind}.`);
  }
  const extension = path.extname(draftPath);
  const relativePath = getContentAssetPath(id, kind, extension || ".bin");
  const targetPath = resolveContentPath(relativePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.rename(absoluteDraft, targetPath);
  return relativePath;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const params = contentQuerySchema.parse({
    q: searchParams.get("q") ?? "",
    page: searchParams.get("page") ?? "1",
    limit: searchParams.get("limit") ?? "50",
  });
  const result = await listContentItems(params);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  await ensureContentStore();
  const contentType = request.headers.get("content-type") ?? "";
  const isMultipart = contentType.includes("multipart/form-data");

  if (!isMultipart) {
    const payload = (await request.json().catch(() => null)) as
      | {
          title?: string;
          thumbnailPath?: string;
          videoPath?: string;
          songPath?: string;
          songDurationSeconds?: number;
          segmentDurationSeconds?: number;
          videoDurationSeconds?: number;
          fadeDurationSeconds?: number;
          introFadeSeconds?: number;
          outroFadeSeconds?: number;
          audioFadeInSeconds?: number;
          audioFadeOutSeconds?: number;
          audioFadeInOffsetSeconds?: number;
          audioFadeOutOffsetSeconds?: number;
          playbackRate?: number;
          overlapRatio?: number;
          fps?: number;
          width?: number;
          height?: number;
          scalePercent?: number;
        }
      | null;

    if (!payload?.thumbnailPath || !payload.videoPath || !payload.songPath) {
      return NextResponse.json(
        { error: "Missing thumbnail, video, or song file." },
        { status: 400 }
      );
    }

    const id = randomUUID();
    const [thumbnailPath, videoPath, songPath] = await Promise.all([
      finalizeDraft(payload.thumbnailPath, id, "thumbnail"),
      finalizeDraft(payload.videoPath, id, "video"),
      finalizeDraft(payload.songPath, id, "song"),
    ]);
    const colorPalette = thumbnailPath
      ? await getPaletteFromPath(resolveContentPath(thumbnailPath))
      : null;

    const overlapRatioValue =
      typeof payload.overlapRatio === "number" ? payload.overlapRatio : null;
    const item = contentCreateSchema.parse({
      id,
      title: payload.title?.trim() || "Untitled",
      status: "uploaded",
      colorPalette,
      paletteMode: "auto",
      songDurationSeconds: Number.isFinite(payload.songDurationSeconds)
        ? payload.songDurationSeconds
        : 0,
      segmentDurationSeconds: Number.isFinite(payload.segmentDurationSeconds)
        ? payload.segmentDurationSeconds
        : 4,
      videoDurationSeconds: Number.isFinite(payload.videoDurationSeconds)
        ? payload.videoDurationSeconds
        : Number.isFinite(payload.segmentDurationSeconds)
          ? payload.segmentDurationSeconds
          : 0,
      fadeDurationSeconds: Number.isFinite(payload.fadeDurationSeconds)
        ? payload.fadeDurationSeconds
        : 1,
      introFadeSeconds: Number.isFinite(payload.introFadeSeconds)
        ? payload.introFadeSeconds
        : 0,
      outroFadeSeconds: Number.isFinite(payload.outroFadeSeconds)
        ? payload.outroFadeSeconds
        : 0,
      audioFadeInSeconds: Number.isFinite(payload.audioFadeInSeconds)
        ? payload.audioFadeInSeconds
        : 0,
      audioFadeOutSeconds: Number.isFinite(payload.audioFadeOutSeconds)
        ? payload.audioFadeOutSeconds
        : 0,
      audioFadeInOffsetSeconds: Number.isFinite(payload.audioFadeInOffsetSeconds)
        ? payload.audioFadeInOffsetSeconds
        : 0,
      audioFadeOutOffsetSeconds: Number.isFinite(payload.audioFadeOutOffsetSeconds)
        ? payload.audioFadeOutOffsetSeconds
        : 0,
      overlapRatio:
        overlapRatioValue !== null
          ? Math.min(0.9, Math.max(0, overlapRatioValue))
          : null,
      playbackRate:
        Number.isFinite(payload.playbackRate) && (payload.playbackRate ?? 0) > 0
          ? payload.playbackRate ?? 1
          : 1,
      fps: Number.isFinite(payload.fps) ? payload.fps : 30,
      width: Number.isFinite(payload.width) ? payload.width : 1280,
      height: Number.isFinite(payload.height) ? payload.height : 720,
      scalePercent: Number.isFinite(payload.scalePercent)
        ? payload.scalePercent
        : 100,
    });

    const created = await createContentItem(item);
    if (!created) {
      return NextResponse.json({ error: "Failed to create item." }, { status: 500 });
    }
    const createdItem = created;
    await writeContentManifest(createdItem.id, {
      ...createdItem,
      assets: { thumbnailPath, videoPath, songPath },
    });
    emitContentUpdate({ type: "content:created", item: createdItem });
    return NextResponse.json(createdItem);
  }

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
  const introFadeSeconds = Number(formData.get("introFadeSeconds") ?? 0);
  const outroFadeSeconds = Number(formData.get("outroFadeSeconds") ?? 0);
  const audioFadeInSeconds = Number(formData.get("audioFadeInSeconds") ?? 0);
  const audioFadeOutSeconds = Number(formData.get("audioFadeOutSeconds") ?? 0);
  const audioFadeInOffsetSeconds = Number(
    formData.get("audioFadeInOffsetSeconds") ?? 0
  );
  const audioFadeOutOffsetSeconds = Number(
    formData.get("audioFadeOutOffsetSeconds") ?? 0
  );
  const overlapRatio = Number(formData.get("overlapRatio") ?? NaN);
  const playbackRate = Number(formData.get("playbackRate") ?? 1);
  const fps = Number(formData.get("fps") ?? 30);
  const width = Number(formData.get("width") ?? 1280);
  const height = Number(formData.get("height") ?? 720);

  const id = randomUUID();
  const [thumbnailPath, videoPath, songPath] = await Promise.all([
    writeUpload(thumbnail, id, "thumbnail"),
    writeUpload(video, id, "video"),
    writeUpload(song, id, "song"),
  ]);

  const colorPalette = thumbnailPath
    ? await getPaletteFromPath(resolveContentPath(thumbnailPath))
    : null;

  const item = contentCreateSchema.parse({
    id,
    title,
    status: "uploaded",
    colorPalette,
    paletteMode: "auto",
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
    introFadeSeconds: Number.isFinite(introFadeSeconds) ? introFadeSeconds : 0,
    outroFadeSeconds: Number.isFinite(outroFadeSeconds) ? outroFadeSeconds : 0,
    audioFadeInSeconds: Number.isFinite(audioFadeInSeconds)
      ? audioFadeInSeconds
      : 0,
    audioFadeOutSeconds: Number.isFinite(audioFadeOutSeconds)
      ? audioFadeOutSeconds
      : 0,
    audioFadeInOffsetSeconds: Number.isFinite(audioFadeInOffsetSeconds)
      ? audioFadeInOffsetSeconds
      : 0,
    audioFadeOutOffsetSeconds: Number.isFinite(audioFadeOutOffsetSeconds)
      ? audioFadeOutOffsetSeconds
      : 0,
    overlapRatio: Number.isFinite(overlapRatio)
      ? Math.min(0.9, Math.max(0, overlapRatio))
      : null,
    playbackRate: Number.isFinite(playbackRate) && playbackRate > 0
      ? playbackRate
      : 1,
    fps: Number.isFinite(fps) ? fps : 30,
    width: Number.isFinite(width) ? width : 1280,
    height: Number.isFinite(height) ? height : 720,
    scalePercent: Number.isFinite(Number(formData.get("scalePercent") ?? 100))
      ? Number(formData.get("scalePercent") ?? 100)
      : 100,
  });

  const created = await createContentItem(item);
  if (!created) {
    return NextResponse.json({ error: "Failed to create item." }, { status: 500 });
  }
  const createdItem = created;
  await writeContentManifest(createdItem.id, {
    ...createdItem,
    assets: { thumbnailPath, videoPath, songPath },
  });
  emitContentUpdate({ type: "content:created", item: createdItem });
  return NextResponse.json(createdItem);
}
