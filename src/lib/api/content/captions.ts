import { z } from "zod";
import { NextResponse } from "next/server";
import { getContentItem } from "@/lib/data/content";
import { contentModeRegistry, normalizeSettingsMap } from "@/lib/content/modes";
import { enqueueCaptionJob, isCaptionQueueEnabled } from "@/lib/queue/caption-queue";
import { processCaptionJob } from "@/lib/captions/process-caption-job";

const triggerCaptionsRequestSchema = z.object({
  mode: z.string().min(1).optional(),
  backend: z.enum(["openai", "local"]).optional(),
  language: z.string().min(2).max(16).optional(),
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

  if (isCaptionQueueEnabled()) {
    await enqueueCaptionJob({
      id,
      userId,
      mode,
      backend: parsed?.backend,
      language:
        parsed?.language ??
        (typeof modeSettings.captionsLanguage === "string"
          ? modeSettings.captionsLanguage
          : undefined),
    });
    return NextResponse.json({ ok: true, status: "queued", id, mode }, { status: 202 });
  }

  await processCaptionJob({
    id,
    userId,
    mode,
    backend: parsed?.backend,
    language:
      parsed?.language ??
      (typeof modeSettings.captionsLanguage === "string"
        ? modeSettings.captionsLanguage
        : undefined),
  });
  return NextResponse.json({ ok: true, status: "done", id, mode }, { status: 200 });
};
