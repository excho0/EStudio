import { z } from "zod";
import { captionDocumentSchema, type CaptionDocument, type CaptionSegment } from "@/types";

const remoteCaptionSchema = z.object({
  text: z.string(),
  fromMs: z.number().int().nonnegative(),
  toMs: z.number().int().nonnegative(),
});

const remoteResponseSchema = z.object({
  backend: z.string(),
  language: z.string().nullable().optional(),
  captions: z.array(remoteCaptionSchema),
  durationMs: z.number().int().nullable().optional(),
  error: z.string().nullable().optional(),
});

const resolveRemoteBaseUrl = () => {
  const base = process.env.CAPTION_REMOTE_CAPTIONS_API_URL?.trim();
  if (!base) {
    throw new Error(
      "Missing CAPTION_REMOTE_CAPTIONS_API_URL for captions-api-app caption backend."
    );
  }
  return base.replace(/\/+$/, "");
};

const resolveRemoteTimeoutMs = () => {
  const raw = process.env.CAPTION_REMOTE_CAPTIONS_API_TIMEOUT_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 600_000;
  if (!Number.isFinite(parsed) || parsed <= 0) return 600_000;
  return parsed;
};

const resolveRemoteToken = () => process.env.CAPTION_REMOTE_TOKEN?.trim() || null;

export const transcribeWithCaptionsApiApp = async ({
  audio,
  fileName,
  language,
  onProgress,
}: {
  userId: string;
  contentId: string;
  mode: string;
  audio: Buffer;
  fileName: string;
  language?: string;
  onProgress?: (progress: number) => void;
}): Promise<CaptionDocument> => {
  const timeoutMs = resolveRemoteTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    onProgress?.(0.05);
    const form = new FormData();
    const audioBytes = new Uint8Array(audio);
    form.set("file", new Blob([audioBytes]), fileName || "audio.mp3");
    if (language?.trim()) {
      form.set("language", language.trim());
    }
    form.set("diarize", "false");

    const headers: Record<string, string> = {};
    const token = resolveRemoteToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${resolveRemoteBaseUrl()}/v1/transcriptions`, {
      method: "POST",
      body: form,
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    onProgress?.(0.9);

    const raw = await response.json().catch(() => null);
    if (!response.ok) {
      const detail =
        raw && typeof raw === "object" && "detail" in raw
          ? String((raw as { detail?: unknown }).detail ?? "")
          : "";
      throw new Error(
        `captions-api-app request failed (${response.status}). ${detail || "No error payload."}`
      );
    }

    const parsed = remoteResponseSchema.parse(raw);
    if (parsed.error) {
      throw new Error(parsed.error);
    }

    const segments: CaptionSegment[] = parsed.captions
      .map((caption) => ({
        text: caption.text.trim(),
        startMs: caption.fromMs,
        endMs: Math.max(caption.toMs, caption.fromMs + 1),
      }))
      .filter((segment) => segment.text.length > 0);

    onProgress?.(1);
    return captionDocumentSchema.parse({
      backend: "captions-api-app",
      language: parsed.language || language || "en",
      generatedAt: new Date().toISOString(),
      segments,
    });
  } finally {
    clearTimeout(timeout);
  }
};
