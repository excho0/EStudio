import path from "path";
import { NextResponse } from "next/server";
import {
  getContentAssetPath,
  removeContentAssetFiles,
  removeContentAssets,
  findContentAssetPath,
  deleteContentManifest,
  writeContentManifest,
  getContentRenderDir,
} from "@/lib/content/store";
import { getStorage } from "@/lib/storage";
import { getPaletteFromPath } from "@/lib/content/color-palette";
import { emitContentUpdate, getRenderProgressSnapshot } from "@/lib/socket/manager";
import {
  contentThumbnailUploadSchema,
  contentUpdateFormSchema,
  contentVideoUploadSchema,
  deleteContentItem,
  getContentItem,
  parseContentSettingsString,
  updateContentItem,
} from "@/lib/data/content";
import {
  DEFAULT_CONTENT_MODE,
  mergeContentSettings,
  normalizeSettingsMap,
  stripSharedScopedKeys,
} from "@/lib/content/modes";
const storage = getStorage();

const writeUpload = async (
  userId: string,
  file: File,
  id: string,
  kind: "thumbnail" | "video"
) => {
  const extension = path.extname(file.name || "");
  const relativePath = getContentAssetPath(userId, id, kind, extension || ".bin");
  const buffer = Buffer.from(await file.arrayBuffer());

  await removeContentAssetFiles(userId, id, kind);
  await storage.writeFile(relativePath, buffer);

  return relativePath;
};

export const handleGetContentItem = async (userId: string, id: string) => {
  const item = await getContentItem(userId, id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const activeProgress = await getRenderProgressSnapshot(userId);
  const hasActiveProgress = Object.values(activeProgress).some((entry) => entry.id === id);
  const withEffectiveStatus = hasActiveProgress
    ? { ...item, status: "rendering" as const }
    : item;
  return NextResponse.json(withEffectiveStatus);
};

export const handlePatchContentItem = async (
  request: Request,
  userId: string,
  id: string
) => {
  const contentType = request.headers.get("content-type") ?? "";
  const isMultipart = contentType.includes("multipart/form-data");
  const item = await getContentItem(userId, id);

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let payload: Record<string, unknown> = {};

  if (isMultipart) {
    const formData = await request.formData();
    const rawEntries = Object.fromEntries(formData.entries());
    const parsedForm = contentUpdateFormSchema.parse(rawEntries);

    if (parsedForm.title && parsedForm.title.trim()) {
      payload.title = parsedForm.title.trim();
    }
    if (parsedForm.status && parsedForm.status.trim()) {
      payload.status = parsedForm.status.trim();
    }
    if (parsedForm.paletteMode) {
      payload.paletteMode = parsedForm.paletteMode;
    }
    if (parsedForm.mode && parsedForm.mode.trim()) {
      payload.mode = parsedForm.mode.trim();
    }
    const parsedSettings = parseContentSettingsString(parsedForm.settings);
    if (parsedSettings) {
      payload.settings = parsedSettings;
    }

    const thumbnail = formData.get("thumbnail");
    const video = formData.get("video");

    if (thumbnail instanceof File) {
      const parsedThumbnail = contentThumbnailUploadSchema.safeParse(thumbnail);
      if (!parsedThumbnail.success) {
        return NextResponse.json(
          { error: parsedThumbnail.error.issues[0]?.message ?? "Invalid thumbnail file." },
          { status: 400 }
        );
      }
      const thumbnailPath = await writeUpload(
        userId,
        parsedThumbnail.data,
        item.id,
        "thumbnail"
      );
      if (payload.paletteMode !== "manual") {
        payload.colorPalette = await getPaletteFromPath(
          storage.resolvePath(thumbnailPath)
        );
      }
      payload.status = item.status;
    }

    if (video instanceof File) {
      const parsedVideo = contentVideoUploadSchema.safeParse(video);
      if (!parsedVideo.success) {
        return NextResponse.json(
          { error: parsedVideo.error.issues[0]?.message ?? "Invalid video file." },
          { status: 400 }
        );
      }
      await writeUpload(userId, parsedVideo.data, item.id, "video");
    }
  } else {
    payload = await request.json();
  }

  const shouldUpdateSettings = "settings" in payload || "mode" in payload;

  if (shouldUpdateSettings) {
    const mode =
      typeof payload.mode === "string"
        ? payload.mode
        : item.mode ?? DEFAULT_CONTENT_MODE;
    const baseSettings =
      (item.settings as Record<string, unknown> | null | undefined) ?? {};
    const patchInput = payload.settings ?? {};
    const baseMap = normalizeSettingsMap(mode, baseSettings);
    const patchMap = normalizeSettingsMap(mode, patchInput);
    const merged = mergeContentSettings(mode, baseMap, patchMap);
    const nextMap = {
      ...baseMap,
      ...patchMap,
      [merged.mode]: merged.settings,
    };
    payload.mode = merged.mode;
    payload.settings = stripSharedScopedKeys(nextMap, ["segmentDurationSeconds"]);
  }

  const resolvedPaletteMode =
    payload.paletteMode === "manual"
      ? "manual"
      : payload.paletteMode === "auto"
        ? "auto"
        : item.paletteMode ?? "auto";

  if (resolvedPaletteMode === "auto" && !("colorPalette" in payload)) {
    const thumbnailPath = await findContentAssetPath(
      userId,
      item.id,
      "thumbnail"
    );
    if (thumbnailPath) {
      payload.colorPalette = await getPaletteFromPath(
        storage.resolvePath(thumbnailPath)
      );
    }
  }

  const updated = await updateContentItem(userId, id, payload);

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  emitContentUpdate({ userId, type: "content.updated", id });
  await writeContentManifest(userId, updated.id, updated);

  return NextResponse.json(updated);
};

export const handleDeleteContentItem = async (
  request: Request,
  userId: string,
  id: string
) => {
  const { searchParams } = new URL(request.url);
  const keepRenders = searchParams.get("keepRenders") === "1";
  const item = await getContentItem(userId, id);

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const removals = [removeContentAssets(userId, item.id)];
  if (!keepRenders) {
    removals.push(storage.deleteDir(getContentRenderDir(userId, item.id)));
  }
  await Promise.all(removals);

  await deleteContentItem(userId, id);
  await deleteContentManifest(userId, id);

  emitContentUpdate({ userId, type: "content.deleted", id });

  return NextResponse.json({ ok: true });
};
