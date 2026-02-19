import { randomUUID } from "crypto";
import path from "path";
import { spawn } from "child_process";
import { NextResponse } from "next/server";
import {
  ensureContentStore,
  getContentAssetPath,
  writeContentManifest,
} from "@/lib/content/store";
import { createTempDir, getStorage, removePath, writeFilePath } from "@/lib/storage";
import { getPaletteFromPath } from "@/lib/content/color-palette";
import { emitContentUpdate, getRenderProgressSnapshot } from "@/lib/socket/manager";
import {
  contentCreateFormSchema,
  contentCreateSchema,
  contentQuerySchema,
  createContentItem,
  listContentItems,
  parseContentSettingsString,
} from "@/lib/data/content";
import {
  DEFAULT_CONTENT_MODE,
  resolveContentSettings,
  normalizeSettingsMap,
} from "@/lib/content/modes";
import { enqueueCaptionJob, isCaptionQueueEnabled } from "@/lib/queue/caption-queue";
import { getLogger } from "@/lib/logging";

const storage = getStorage();
const logger = getLogger("api-content-collection");

const shouldAutoCaption = () =>
  process.env.CAPTION_AUTO_ON_UPLOAD?.trim().toLowerCase() === "true";

const enqueueCaptionOnCreate = async (params: {
  id: string;
  userId: string;
  mode: string;
  settings: Record<string, unknown>;
}) => {
  if (!shouldAutoCaption()) return;
  const captionsEnabled = params.settings.captionsEnabled === true;
  if (!captionsEnabled) return;
  if (!isCaptionQueueEnabled()) {
    logger.warn(
      { id: params.id, mode: params.mode },
      "Caption auto-generation skipped: caption queue is disabled or missing Redis URL."
    );
    return;
  }
  try {
    const requestedBackend =
      typeof params.settings.captionsBackend === "string"
        ? params.settings.captionsBackend
        : undefined;
    await enqueueCaptionJob({
      id: params.id,
      userId: params.userId,
      mode: params.mode,
      backend: requestedBackend,
      language:
        typeof params.settings.captionsLanguage === "string"
          ? params.settings.captionsLanguage
          : undefined,
    });
  } catch (error) {
    logger.warn(
      { error, id: params.id, mode: params.mode },
      "Failed to enqueue caption generation on content create."
    );
  }
};

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

const withStorageKeyLocalPath = async <T>(
  key: string,
  fileName: string,
  run: (absolutePath: string) => Promise<T>
) => {
  const tempDir = await createTempDir("content-probe");
  const absolutePath = path.join(tempDir, fileName);
  try {
    const buffer = await storage.readFile(key);
    await writeFilePath(absolutePath, buffer);
    return await run(absolutePath);
  } finally {
    await removePath(tempDir, { recursive: true, force: true });
  }
};

const getPaletteFromStorageKey = async (key: string) => {
  const extension = path.extname(key) || ".bin";
  return withStorageKeyLocalPath(key, `thumbnail${extension}`, async (absolutePath) =>
    getPaletteFromPath(absolutePath)
  );
};

const getSongDurationFromStorageKey = async (key: string) => {
  const extension = path.extname(key) || ".bin";
  return withStorageKeyLocalPath(key, `song${extension}`, async (absolutePath) =>
    getAudioDurationSeconds(absolutePath)
  );
};

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

export const handleListContent = async (request: Request, userId: string) => {
  const { searchParams } = new URL(request.url);
  const params = contentQuerySchema.parse({
    q: searchParams.get("q") ?? "",
    status: searchParams.get("status") ?? undefined,
    sortBy: searchParams.get("sortBy") ?? undefined,
    sortDir: searchParams.get("sortDir") ?? undefined,
    page: searchParams.get("page") ?? "1",
    limit: searchParams.get("limit") ?? "50",
  });
  const activeProgress = await getRenderProgressSnapshot(userId);
  const hasActiveProgressForId = (id: string) =>
    Object.values(activeProgress).some((entry) => entry.id === id);
  const result = await listContentItems(userId, params);
  const items = result.items.map((item) =>
    hasActiveProgressForId(item.id) ? { ...item, status: "rendering" as const } : item
  );
  return NextResponse.json({ ...result, items });
};

export const handleCreateContent = async (request: Request, userId: string) => {
  await ensureContentStore(userId);
  const contentType = request.headers.get("content-type") ?? "";
  const isMultipart = contentType.includes("multipart/form-data");

  if (!isMultipart) {
    const payload = (await request.json().catch(() => null)) as
      | {
          title?: string;
          thumbnailPath?: string;
          videoPath?: string;
          songPath?: string;
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
      finalizeDraft(userId, payload.thumbnailPath, id, "thumbnail"),
      finalizeDraft(userId, payload.videoPath, id, "video"),
      finalizeDraft(userId, payload.songPath, id, "song"),
    ]);
    const colorPalette = thumbnailPath
      ? await getPaletteFromStorageKey(thumbnailPath)
      : null;
    const serverSongDuration = await getSongDurationFromStorageKey(songPath);

    const mode = payload.mode ?? DEFAULT_CONTENT_MODE;
    const settingsInput = payload.settings ?? {};
    const resolved = resolveContentSettings(mode, settingsInput);
    const settingsMap = normalizeSettingsMap(mode, settingsInput);
    settingsMap[resolved.mode] = resolved.settings as Record<string, unknown>;
    const songDurationSeconds = serverSongDuration ?? 0;
    const item = contentCreateSchema.parse({
      id,
      userId,
      title: payload.title?.trim() || "Untitled",
      status: "uploaded",
      colorPalette,
      paletteMode: "auto",
      mode: resolved.mode,
      settings: settingsMap,
      songDurationSeconds,
    });

    const created = await createContentItem(item);
    if (!created) {
      return NextResponse.json({ error: "Failed to create item." }, { status: 500 });
    }
    await writeContentManifest(userId, created.id, {
      ...created,
      assets: { thumbnailPath, videoPath, songPath },
    });
    emitContentUpdate({ userId, type: "content:created", item: created });
    await enqueueCaptionOnCreate({
      id: created.id,
      userId,
      mode: resolved.mode,
      settings: resolved.settings as Record<string, unknown>,
    });
    return NextResponse.json(created);
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

  const { mode, settings: settingsRaw } = parsedForm;

  const id = randomUUID();
  const [thumbnailPath, videoPath, songPath] = await Promise.all([
    writeUpload(userId, thumbnail, id, "thumbnail"),
    writeUpload(userId, video, id, "video"),
    writeUpload(userId, song, id, "song"),
  ]);

  const colorPalette = thumbnailPath
    ? await getPaletteFromStorageKey(thumbnailPath)
    : null;
  const serverSongDuration = await getSongDurationFromStorageKey(songPath);

  const settingsInput = parseContentSettingsString(settingsRaw);
  const resolved = resolveContentSettings(mode, settingsInput ?? {});
  const settingsMap = normalizeSettingsMap(mode, settingsInput ?? {});
  settingsMap[resolved.mode] = resolved.settings as Record<string, unknown>;

  const item = contentCreateSchema.parse({
    id,
    userId,
    title,
    status: "uploaded",
    colorPalette,
    paletteMode: "auto",
    mode: resolved.mode,
    settings: settingsMap,
    songDurationSeconds: serverSongDuration ?? 0,
  });

  const created = await createContentItem(item);
  if (!created) {
    return NextResponse.json({ error: "Failed to create item." }, { status: 500 });
  }
  await writeContentManifest(userId, created.id, {
    ...created,
    assets: { thumbnailPath, videoPath, songPath },
  });
  emitContentUpdate({ userId, type: "content:created", item: created });
  await enqueueCaptionOnCreate({
    id: created.id,
    userId,
    mode: resolved.mode,
    settings: resolved.settings as Record<string, unknown>,
  });
  return NextResponse.json(created);
};
