import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import {
  contentPaths,
  ensureContentStore,
  findContentAssetPath,
} from "@/lib/content-store";
import {
  contentCreateSchema,
  createContentItem,
  getContentItem,
} from "@/lib/data/content";

export const runtime = "nodejs";

export async function POST() {
  await ensureContentStore();
  const manifestsDir = contentPaths.manifestsDir;
  let files: string[] = [];
  try {
    files = await fs.readdir(manifestsDir);
  } catch {
    return NextResponse.json(
      { created: 0, skipped: 0, errors: ["Manifest directory not found."] },
      { status: 404 }
    );
  }

  const manifestFiles = files.filter((file) => file.endsWith(".json"));
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const file of manifestFiles) {
    try {
      const raw = await fs.readFile(path.join(manifestsDir, file), "utf-8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      const candidate = {
        id: data.id,
        title: data.title ?? "Recovered",
        status: data.status ?? "uploaded",
        songDurationSeconds: data.songDurationSeconds ?? 0,
        segmentDurationSeconds: data.segmentDurationSeconds ?? 4,
        fadeDurationSeconds: data.fadeDurationSeconds ?? 1,
        introFadeSeconds: data.introFadeSeconds ?? 0,
        outroFadeSeconds: data.outroFadeSeconds ?? 0,
        audioFadeInSeconds: data.audioFadeInSeconds ?? 0,
        audioFadeOutSeconds: data.audioFadeOutSeconds ?? 0,
        audioFadeInOffsetSeconds: data.audioFadeInOffsetSeconds ?? 0,
        audioFadeOutOffsetSeconds: data.audioFadeOutOffsetSeconds ?? 0,
        videoDurationSeconds: data.videoDurationSeconds ?? 0,
        overlapRatio: data.overlapRatio ?? null,
        playbackRate: data.playbackRate ?? 1,
        fps: data.fps ?? 30,
        width: data.width ?? 1280,
        height: data.height ?? 720,
      };
      const parsed = contentCreateSchema.parse(candidate);
      const existing = await getContentItem(parsed.id);
      if (existing) {
        skipped += 1;
        continue;
      }
      const [thumbOk, videoOk, songOk] = await Promise.all([
        findContentAssetPath(parsed.id, "thumbnail"),
        findContentAssetPath(parsed.id, "video"),
        findContentAssetPath(parsed.id, "song"),
      ]);
      if (!thumbOk || !videoOk || !songOk) {
        skipped += 1;
        errors.push(`Missing files for ${parsed.id}`);
        continue;
      }
      await createContentItem(parsed);
      created += 1;
    } catch (error) {
      errors.push(
        `Failed to import ${file}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  return NextResponse.json({ created, skipped, errors });
}
