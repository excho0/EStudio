import { randomUUID } from "crypto";
import path from "path";
import { NextResponse } from "next/server";
import {
  ensureContentStore,
  getContentAssetPath,
  writeContentManifest,
} from "@/lib/content-store";
import { getStorage } from "@/lib/storage";
import { getPaletteFromPath } from "@/lib/color-palette";
import { emitContentUpdate } from "@/lib/socket";
import {
  contentCreateFormSchema,
  contentCreateSchema,
  contentQuerySchema,
  createContentItem,
  listContentItems,
  parseContentSettingsString,
} from "@/lib/data/content";
import { getSessionUser } from "@/lib/auth-session";
import {
  DEFAULT_CONTENT_MODE,
  legacyColumnsToSettings,
  resolveContentSettings,
  normalizeSettingsMap,
  settingsToLegacyColumns,
} from "@/lib/content-modes";

export const runtime = "nodejs";

const storage = getStorage();

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

    const mode = payload.mode ?? DEFAULT_CONTENT_MODE;
    const settingsInput =
      payload.settings ?? legacyColumnsToSettings(mode, payload as Record<string, unknown>);
    const resolved = resolveContentSettings(mode, settingsInput);
    const settingsMap = normalizeSettingsMap(mode, settingsInput);
    settingsMap[resolved.mode] = resolved.settings as Record<string, unknown>;
    const legacySettings = settingsToLegacyColumns(resolved.mode, resolved.settings);
    const overlapRatioValue =
      typeof legacySettings.overlapRatio === "number" ? legacySettings.overlapRatio : null;
    const item = contentCreateSchema.parse({
      id,
      userId: user.id,
      title: payload.title?.trim() || "Untitled",
      status: "uploaded",
      colorPalette,
      paletteMode: "auto",
      mode: resolved.mode,
      settings: settingsMap,
      ...legacySettings,
      overlapRatio:
        overlapRatioValue !== null
          ? Math.min(0.9, Math.max(0, overlapRatioValue))
          : null,
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

  const { songDurationSeconds, mode, settings: settingsRaw } = parsedForm;

  const id = randomUUID();
  const [thumbnailPath, videoPath, songPath] = await Promise.all([
    writeUpload(user.id, thumbnail, id, "thumbnail"),
    writeUpload(user.id, video, id, "video"),
    writeUpload(user.id, song, id, "song"),
  ]);

  const colorPalette = thumbnailPath
    ? await getPaletteFromPath(storage.resolvePath(thumbnailPath))
    : null;

  const settingsInput = parseContentSettingsString(settingsRaw);
  const legacyFallback = legacyColumnsToSettings(mode, {
    songDurationSeconds,
  });
  const resolved = resolveContentSettings(
    mode,
    settingsInput ?? legacyFallback
  );
  const settingsMap = normalizeSettingsMap(mode, settingsInput ?? legacyFallback);
  settingsMap[resolved.mode] = resolved.settings as Record<string, unknown>;
  const legacySettings = settingsToLegacyColumns(resolved.mode, resolved.settings);
  const overlapRatioValue =
    typeof legacySettings.overlapRatio === "number" ? legacySettings.overlapRatio : null;

  const item = contentCreateSchema.parse({
    id,
    userId: user.id,
    title,
    status: "uploaded",
    colorPalette,
    paletteMode: "auto",
    mode: resolved.mode,
    settings: settingsMap,
    ...legacySettings,
    overlapRatio:
      overlapRatioValue !== null
        ? Math.min(0.9, Math.max(0, overlapRatioValue))
        : null,
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
