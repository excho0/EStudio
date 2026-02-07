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
} from "@/lib/content-store";
import { getStorage } from "@/lib/storage";
import { getPaletteFromPath } from "@/lib/color-palette";
import { emitContentUpdate } from "@/lib/socket";
import {
  contentUpdateFormSchema,
  deleteContentItem,
  getContentItem,
  parseContentSettingsString,
  updateContentItem,
} from "@/lib/data/content";
import { getSessionUser } from "@/lib/auth-session";
import {
  DEFAULT_CONTENT_MODE,
  legacyColumnsToSettings,
  mergeContentSettings,
  normalizeSettingsMap,
  settingsToLegacyColumns,
} from "@/lib/content-modes";

export const runtime = "nodejs";

const storage = getStorage();

const writeUpload = async (
  userId: string,
  file: File,
  id: string,
  kind: "thumbnail"
) => {
  const extension = path.extname(file.name || "");
  const relativePath = getContentAssetPath(userId, id, kind, extension || ".bin");
  const buffer = Buffer.from(await file.arrayBuffer());

  await removeContentAssetFiles(userId, id, kind);
  await storage.writeFile(relativePath, buffer);

  return relativePath;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const item = await getContentItem(user.id, id);

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
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const contentType = request.headers.get("content-type") ?? "";
  const isMultipart = contentType.includes("multipart/form-data");
  const item = await getContentItem(user.id, id);

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
    if (parsedForm.fadeDurationSeconds !== undefined) {
      payload.fadeDurationSeconds = parsedForm.fadeDurationSeconds;
    }
    if (parsedForm.introFadeSeconds !== undefined) {
      payload.introFadeSeconds = parsedForm.introFadeSeconds;
    }
    if (parsedForm.outroFadeSeconds !== undefined) {
      payload.outroFadeSeconds = parsedForm.outroFadeSeconds;
    }
    if (parsedForm.audioFadeInSeconds !== undefined) {
      payload.audioFadeInSeconds = parsedForm.audioFadeInSeconds;
    }
    if (parsedForm.audioFadeOutSeconds !== undefined) {
      payload.audioFadeOutSeconds = parsedForm.audioFadeOutSeconds;
    }
    if (parsedForm.audioFadeInOffsetSeconds !== undefined) {
      payload.audioFadeInOffsetSeconds = parsedForm.audioFadeInOffsetSeconds;
    }
    if (parsedForm.audioFadeOutOffsetSeconds !== undefined) {
      payload.audioFadeOutOffsetSeconds = parsedForm.audioFadeOutOffsetSeconds;
    }
    if (parsedForm.visualizationEnabled !== undefined) {
      payload.visualizationEnabled = parsedForm.visualizationEnabled;
    }
    if (parsedForm.visualizationBars !== undefined) {
      payload.visualizationBars = Math.max(
        1,
        Math.round(parsedForm.visualizationBars)
      );
    }
    if (parsedForm.playbackRate !== undefined) {
      payload.playbackRate = parsedForm.playbackRate;
    }
    if (parsedForm.fps !== undefined) {
      payload.fps = parsedForm.fps;
    }
    if (parsedForm.width !== undefined) {
      payload.width = parsedForm.width;
    }
    if (parsedForm.height !== undefined) {
      payload.height = parsedForm.height;
    }
    if (parsedForm.scalePercent !== undefined) {
      payload.scalePercent = parsedForm.scalePercent;
    }
    if (parsedForm.overlapRatio !== undefined) {
      payload.overlapRatio = Math.min(
        0.9,
        Math.max(0, parsedForm.overlapRatio)
      );
    }
    if (parsedForm.mode && parsedForm.mode.trim()) {
      payload.mode = parsedForm.mode.trim();
    }
    const parsedSettings = parseContentSettingsString(parsedForm.settings);
    if (parsedSettings) {
      payload.settings = parsedSettings;
    }

    const thumbnail = formData.get("thumbnail");

    if (thumbnail instanceof File) {
      const thumbnailPath = await writeUpload(
        user.id,
        thumbnail,
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
  } else {
    payload = await request.json();
  }

  const legacySettingKeys = [
    "songDurationSeconds",
    "segmentDurationSeconds",
    "videoDurationSeconds",
    "fadeDurationSeconds",
    "introFadeSeconds",
    "outroFadeSeconds",
    "audioFadeInSeconds",
    "audioFadeOutSeconds",
    "audioFadeInOffsetSeconds",
    "audioFadeOutOffsetSeconds",
    "scalePercent",
    "visualizationEnabled",
    "visualizationBars",
    "edgeRaysEnabled",
    "edgeRaysIntensity",
    "edgeRaysVocalBalance",
    "overlapRatio",
    "playbackRate",
    "fps",
    "width",
    "height",
  ];
  const hasLegacyPatch = legacySettingKeys.some((key) => key in payload);
  const shouldUpdateSettings =
    "settings" in payload || "mode" in payload || hasLegacyPatch;

  if (shouldUpdateSettings) {
    const mode =
      typeof payload.mode === "string"
        ? payload.mode
        : item.mode ?? DEFAULT_CONTENT_MODE;
    const baseSettings =
      (item.settings as Record<string, unknown> | null | undefined) ??
      legacyColumnsToSettings(mode, item as Record<string, unknown>);
    const patchInput =
      payload.settings ??
      (hasLegacyPatch
        ? legacyColumnsToSettings(mode, payload as Record<string, unknown>)
        : {});
    const baseMap = normalizeSettingsMap(mode, baseSettings);
    const patchMap = normalizeSettingsMap(mode, patchInput);
    const merged = mergeContentSettings(mode, baseMap, patchMap);
    const nextMap = {
      ...baseMap,
      ...patchMap,
      [merged.mode]: merged.settings,
    };
    payload.mode = merged.mode;
    payload.settings = nextMap;
    Object.assign(payload, settingsToLegacyColumns(merged.mode, merged.settings));
  }

  const resolvedPaletteMode =
    payload.paletteMode === "manual"
      ? "manual"
      : payload.paletteMode === "auto"
        ? "auto"
        : item.paletteMode ?? "auto";

  if (resolvedPaletteMode === "auto" && !("colorPalette" in payload)) {
    const thumbnailPath = await findContentAssetPath(
      user.id,
      item.id,
      "thumbnail"
    );
    if (thumbnailPath) {
      payload.colorPalette = await getPaletteFromPath(
        storage.resolvePath(thumbnailPath)
      );
    }
  }

  const updated = await updateContentItem(user.id, id, payload);

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  emitContentUpdate({ userId: user.id, type: "content:updated", id });
  await writeContentManifest(user.id, updated.id, updated);

  return NextResponse.json(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const keepRenders = searchParams.get("keepRenders") === "1";
  const item = await getContentItem(user.id, id);

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const removals = [removeContentAssets(user.id, item.id)];
  if (!keepRenders) {
    removals.push(storage.deleteDir(getContentRenderDir(user.id, item.id)));
  }
  await Promise.all(removals);

  await deleteContentItem(user.id, id);
  await deleteContentManifest(user.id, id);

  emitContentUpdate({ userId: user.id, type: "content:deleted", id });

  return NextResponse.json({ ok: true });
}
