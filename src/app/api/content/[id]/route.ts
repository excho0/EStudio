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
  deleteContentItem,
  getContentItem,
  updateContentItem,
} from "@/lib/data/content";
import { getSessionUser } from "@/lib/auth-session";

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
    const title = formData.get("title");
    const status = formData.get("status");
    const paletteMode = formData.get("paletteMode");
    const fadeDurationSeconds = formData.get("fadeDurationSeconds");
    const introFadeSeconds = formData.get("introFadeSeconds");
    const outroFadeSeconds = formData.get("outroFadeSeconds");
    const audioFadeInSeconds = formData.get("audioFadeInSeconds");
    const audioFadeOutSeconds = formData.get("audioFadeOutSeconds");
    const audioFadeInOffsetSeconds = formData.get("audioFadeInOffsetSeconds");
    const audioFadeOutOffsetSeconds = formData.get("audioFadeOutOffsetSeconds");
    const visualizationEnabled = formData.get("visualizationEnabled");
    const visualizationBars = formData.get("visualizationBars");
    const playbackRate = formData.get("playbackRate");
    const fps = formData.get("fps");
    const width = formData.get("width");
    const height = formData.get("height");
    const scalePercent = formData.get("scalePercent");
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
    if (paletteMode === "auto" || paletteMode === "manual") {
      payload.paletteMode = paletteMode;
    }
    const fadeValue = toOptionalNumber(fadeDurationSeconds);
    if (fadeValue !== undefined) {
      payload.fadeDurationSeconds = fadeValue;
    }
    const introFadeValue = toOptionalNumber(introFadeSeconds);
    if (introFadeValue !== undefined) {
      payload.introFadeSeconds = introFadeValue;
    }
    const outroFadeValue = toOptionalNumber(outroFadeSeconds);
    if (outroFadeValue !== undefined) {
      payload.outroFadeSeconds = outroFadeValue;
    }
    const audioFadeInValue = toOptionalNumber(audioFadeInSeconds);
    if (audioFadeInValue !== undefined) {
      payload.audioFadeInSeconds = audioFadeInValue;
    }
    const audioFadeOutValue = toOptionalNumber(audioFadeOutSeconds);
    if (audioFadeOutValue !== undefined) {
      payload.audioFadeOutSeconds = audioFadeOutValue;
    }
    const audioFadeInOffsetValue = toOptionalNumber(audioFadeInOffsetSeconds);
    if (audioFadeInOffsetValue !== undefined) {
      payload.audioFadeInOffsetSeconds = audioFadeInOffsetValue;
    }
    const audioFadeOutOffsetValue = toOptionalNumber(audioFadeOutOffsetSeconds);
    if (audioFadeOutOffsetValue !== undefined) {
      payload.audioFadeOutOffsetSeconds = audioFadeOutOffsetValue;
    }
    if (typeof visualizationEnabled === "string") {
      payload.visualizationEnabled =
        visualizationEnabled === "true" || visualizationEnabled === "1";
    }
    const visualizationBarsValue = toOptionalNumber(visualizationBars);
    if (visualizationBarsValue !== undefined) {
      payload.visualizationBars = Math.max(1, Math.round(visualizationBarsValue));
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
    const scalePercentValue = toOptionalNumber(scalePercent);
    if (scalePercentValue !== undefined) {
      payload.scalePercent = scalePercentValue;
    }
    const overlapValue = toOptionalNumber(overlapRatio);
    if (overlapValue !== undefined) {
      payload.overlapRatio = Math.min(0.9, Math.max(0, overlapValue));
    }

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
