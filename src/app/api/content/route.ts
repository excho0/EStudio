import { randomUUID } from "crypto";
import path from "path";
import { spawn } from "child_process";
import { NextResponse } from "next/server";
import {
  ensureContentStore,
  getContentAssetPath,
  writeContentManifest,
} from "@/lib/content/store";
import { getStorage } from "@/lib/storage";
import { getPaletteFromPath } from "@/lib/content/color-palette";
import { emitContentUpdate } from "@/lib/socket/manager";
import {
  contentCreateFormSchema,
  contentCreateSchema,
  contentQuerySchema,
  createContentItem,
  failStaleRenderingItems,
  listContentItems,
  parseContentSettingsString,
} from "@/lib/data/content";
import { getSessionUser } from "@/lib/auth/session";
import {
  DEFAULT_CONTENT_MODE,
  resolveContentSettings,
  normalizeSettingsMap,
} from "@/lib/content-modes";
import { getRenderProgressSnapshot } from "@/lib/socket/manager";

export const runtime = "nodejs";

const storage = getStorage();

const parseDurationFromFfmpegOutput = (output: string) => {
  const match = output.match(/Duration:\\s*(\\d+):(\\d+):(\\d+(?:\\.\\d+)?)/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (![hours, minutes, seconds].every((value) => Number.isFinite(value))) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
};

const getAudioDurationSeconds = (absolutePath: string) =>
  new Promise<number | null>((resolve) => {
    const tryFfprobe = () => {
      const proc = spawn("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=nw=1:nk=1",
        absolutePath,
      ]);
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      proc.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      proc.on("close", (code) => {
        if (code === 0) {
          const parsed = Number(stdout.trim());
          if (Number.isFinite(parsed) && parsed > 0) {
            resolve(parsed);
            return;
          }
        }
        tryFfmpeg(stderr);
      });
    };

    const tryFfmpeg = (stderrSeed = "") => {
      const proc = spawn("ffmpeg", ["-i", absolutePath, "-f", "null", "-"]);
      let stderr = stderrSeed;
      proc.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      proc.on("close", () => {
        const parsed = parseDurationFromFfmpegOutput(stderr);
        resolve(parsed && parsed > 0 ? parsed : null);
      });
    };

    tryFfprobe();
  });

const writeUpload = async (
  userId: string,
  file: File,
  id: string,
  kind: "thumbnail" | "video" | "song"
) => {
  const extension = path.extname(file.name || "");
  const relativePath = getContentAssetPath(userId, id, kind, extension || ".bin");
  const buffer = Buffer.from(await file.arrayBuffer());

  await storage.writeFile(relativePath, buffer);

  return relativePath;
};

const finalizeDraft = async (
  userId: string,
  draftPath: string,
  id: string,
  kind: "thumbnail" | "video" | "song"
) => {
  if (!(await storage.exists(draftPath))) {
    throw new Error(`Draft file missing for ${kind}.`);
  }
  const extension = path.extname(draftPath);
  const relativePath = getContentAssetPath(userId, id, kind, extension || ".bin");
  await storage.move(draftPath, relativePath);
  return relativePath;
};

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const params = contentQuerySchema.parse({
    q: searchParams.get("q") ?? "",
    status: searchParams.get("status") ?? undefined,
    sortBy: searchParams.get("sortBy") ?? undefined,
    sortDir: searchParams.get("sortDir") ?? undefined,
    page: searchParams.get("page") ?? "1",
    limit: searchParams.get("limit") ?? "50",
  });
  const activeProgress = await getRenderProgressSnapshot(user.id);
  const staleTimeoutMs = Math.max(
    10_000,
    Number(process.env.RENDER_STALE_TIMEOUT_MS ?? "120000")
  );
  const recoveredIds = await failStaleRenderingItems(user.id, {
    activeIds: Object.keys(activeProgress),
    staleBefore: new Date(Date.now() - staleTimeoutMs),
  });
  if (recoveredIds.length > 0) {
    for (const recoveredId of recoveredIds) {
      emitContentUpdate({
        userId: user.id,
        type: "content:status",
        id: recoveredId,
        status: "failed",
      });
    }
  }
  const result = await listContentItems(user.id, params);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureContentStore(user.id);
  const contentType = request.headers.get("content-type") ?? "";
  const isMultipart = contentType.includes("multipart/form-data");

  if (!isMultipart) {
    const payload = (await request.json().catch(() => null)) as
      | {
          title?: string;
          thumbnailPath?: string;
          videoPath?: string;
          songPath?: string;
          fps?: number;
          width?: number;
          height?: number;
          mode?: string;
          settings?: Record<string, unknown>;
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
      finalizeDraft(user.id, payload.thumbnailPath, id, "thumbnail"),
      finalizeDraft(user.id, payload.videoPath, id, "video"),
      finalizeDraft(user.id, payload.songPath, id, "song"),
    ]);
    const colorPalette = thumbnailPath
      ? await getPaletteFromPath(storage.resolvePath(thumbnailPath))
      : null;
    const songAbsolutePath = storage.resolvePath(songPath);
    const serverSongDuration = await getAudioDurationSeconds(songAbsolutePath);

    const mode = payload.mode ?? DEFAULT_CONTENT_MODE;
    const settingsInput = payload.settings ?? {};
    const resolved = resolveContentSettings(mode, settingsInput);
    const settingsMap = normalizeSettingsMap(mode, settingsInput);
    settingsMap[resolved.mode] = resolved.settings as Record<string, unknown>;
    const songDurationSeconds = serverSongDuration ?? 0;
    const fps = typeof payload.fps === "number" ? payload.fps : undefined;
    const width = typeof payload.width === "number" ? payload.width : undefined;
    const height = typeof payload.height === "number" ? payload.height : undefined;
    const item = contentCreateSchema.parse({
      id,
      userId: user.id,
      title: payload.title?.trim() || "Untitled",
      status: "uploaded",
      colorPalette,
      paletteMode: "auto",
      mode: resolved.mode,
      settings: settingsMap,
      songDurationSeconds,
      fps,
      width,
      height,
    });

    const created = await createContentItem(item);
    if (!created) {
      return NextResponse.json({ error: "Failed to create item." }, { status: 500 });
    }
    const createdItem = created;
    await writeContentManifest(user.id, createdItem.id, {
      ...createdItem,
      assets: { thumbnailPath, videoPath, songPath },
    });
    emitContentUpdate({ userId: user.id, type: "content:created", item: createdItem });
    return NextResponse.json(createdItem);
  }

  const formData = await request.formData();

  const rawEntries = Object.fromEntries(formData.entries());
  const parsedForm = contentCreateFormSchema.parse(rawEntries);

  const title = parsedForm.title;
  const thumbnail = formData.get("thumbnail");
  const video = formData.get("video");
  const song = formData.get("song");

  if (!(thumbnail instanceof File) || !(video instanceof File) || !(song instanceof File)) {
    return NextResponse.json(
      { error: "Missing thumbnail, video, or song file." },
      { status: 400 }
    );
  }

  const { fps, width, height, mode, settings: settingsRaw } = parsedForm;

  const id = randomUUID();
  const [thumbnailPath, videoPath, songPath] = await Promise.all([
    writeUpload(user.id, thumbnail, id, "thumbnail"),
    writeUpload(user.id, video, id, "video"),
    writeUpload(user.id, song, id, "song"),
  ]);

  const colorPalette = thumbnailPath
    ? await getPaletteFromPath(storage.resolvePath(thumbnailPath))
    : null;
  const songAbsolutePath = storage.resolvePath(songPath);
  const serverSongDuration = await getAudioDurationSeconds(songAbsolutePath);

  const settingsInput = parseContentSettingsString(settingsRaw);
  const resolved = resolveContentSettings(mode, settingsInput ?? {});
  const settingsMap = normalizeSettingsMap(mode, settingsInput ?? {});
  settingsMap[resolved.mode] = resolved.settings as Record<string, unknown>;

  const item = contentCreateSchema.parse({
    id,
    userId: user.id,
    title,
    status: "uploaded",
    colorPalette,
    paletteMode: "auto",
    mode: resolved.mode,
    settings: settingsMap,
    songDurationSeconds: serverSongDuration ?? 0,
    fps,
    width,
    height,
  });

  const created = await createContentItem(item);
  if (!created) {
    return NextResponse.json({ error: "Failed to create item." }, { status: 500 });
  }
  const createdItem = created;
  await writeContentManifest(user.id, createdItem.id, {
    ...createdItem,
    assets: { thumbnailPath, videoPath, songPath },
  });
  emitContentUpdate({ userId: user.id, type: "content:created", item: createdItem });
  return NextResponse.json(createdItem);
}
