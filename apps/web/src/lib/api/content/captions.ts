import crypto from "crypto";
import { z } from "zod";
import { NextResponse } from "next/server";
import { captionDocumentSchema } from "@/types";
import { getContentItem, updateContentItem } from "@/lib/data/content";
import { contentModeRegistry, normalizeSettingsMap } from "@/lib/content/modes";
import { enqueueCaptionJob, isCaptionQueueEnabled } from "@/lib/queue/caption-queue";
import { processCaptionJob } from "@/lib/captions/process-caption-job";
import { emitCaptionUpdate, emitContentUpdate } from "@/lib/socket/manager";
import { resolveCaptionBackendSetting } from "@/lib/data/settings";
import { settingsCaptionBackendSchema } from "@/lib/data/settings/schemas";

const resolveDefaultCaptionLanguage = () => {
  const value = process.env.CAPTION_DEFAULT_LANGUAGE?.trim();
  return value && value.length >= 2 ? value : undefined;
};

const triggerCaptionsRequestSchema = z.object({
  mode: z.string().min(1).optional(),
  backend: settingsCaptionBackendSchema.optional(),
  language: z.string().min(2).max(16).optional(),
});

const saveCaptionsRequestSchema = z.object({
  captionsData: captionDocumentSchema.nullable(),
});

export const handleTriggerCaptions = async (
  request: Request,
  userId: string,
  id: string
) => {
  const item = await getContentItem(userId, id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = triggerCaptionsRequestSchema
    .safeParse(await request.json().catch(() => null))
    .data;
  const jobId = crypto.randomUUID();
  const mode = parsed?.mode?.trim() || item.mode;
  if (!mode || !(mode in contentModeRegistry)) {
    return NextResponse.json({ error: "Invalid caption mode." }, { status: 400 });
  }

  const settingsMap = normalizeSettingsMap(item.mode, item.settings ?? {});
  if (!settingsMap[mode]) {
    return NextResponse.json(
      { error: "Requested caption mode is not configured for this content." },
      { status: 400 }
    );
  }

  const modeSettings =
    (settingsMap[mode] as Record<string, unknown> | undefined) ?? {};
  if (modeSettings.captionsEnabled !== true) {
    return NextResponse.json(
      { error: "Captions are disabled for this mode." },
      { status: 409 }
    );
  }

  const backend = parsed?.backend ?? (await resolveCaptionBackendSetting());

  if (isCaptionQueueEnabled()) {
    const metadata = item.title ? { title: item.title } : undefined;
    await enqueueCaptionJob({
      id,
      userId,
      jobId,
      mode,
      backend,
      language:
        parsed?.language ??
        (typeof modeSettings.captionsLanguage === "string"
          ? modeSettings.captionsLanguage
          : resolveDefaultCaptionLanguage()),
    });
    emitCaptionUpdate({
      userId,
      id,
      jobId,
      mode,
      status: "queued",
      progress: 0,
      metadata,
    });
    return NextResponse.json({ ok: true, status: "queued", id, mode, jobId }, { status: 202 });
  }

  await processCaptionJob({
    id,
    userId,
    jobId,
    mode,
    backend,
    language:
      parsed?.language ??
      (typeof modeSettings.captionsLanguage === "string"
        ? modeSettings.captionsLanguage
        : resolveDefaultCaptionLanguage()),
  });
  return NextResponse.json({ ok: true, status: "done", id, mode }, { status: 200 });
};

export const handleSaveCaptions = async (
  request: Request,
  userId: string,
  id: string
) => {
  const item = await getContentItem(userId, id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = saveCaptionsRequestSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const mode = item.mode;
  const settingsMap = normalizeSettingsMap(mode, item.settings ?? {});
  const shared =
    settingsMap.__shared &&
    typeof settingsMap.__shared === "object" &&
    !Array.isArray(settingsMap.__shared)
      ? (settingsMap.__shared as Record<string, unknown>)
      : {};

  const updated = await updateContentItem(userId, id, {
    settings: {
      ...settingsMap,
      __shared: {
        ...shared,
        captionsData: parsed.data.captionsData,
      },
    },
  });

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  emitContentUpdate({ userId, type: "content.updated", id });
  return NextResponse.json({
    ok: true,
    id,
    captionsData: parsed.data.captionsData,
  });
};
