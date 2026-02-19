import { z } from "zod";
import { getLogger } from "@/lib/logging";
import type { CaptionDocument } from "@/types";
import { transcribeWithLocalWhisper } from "./backends/local-whisper";
import { transcribeWithOpenAiWhisper } from "./backends/openai-whisper";

const logger = getLogger("captions-backend");

export const captionBackendSchema = z.enum(["openai", "local"]);
export type CaptionBackend = z.infer<typeof captionBackendSchema>;

export type CaptionBackendInput = {
  userId: string;
  contentId: string;
  mode: string;
  audio: Buffer;
  fileName: string;
  language?: string;
};

export type CaptionBackendRunner = (
  input: CaptionBackendInput
) => Promise<CaptionDocument>;

const BACKEND_RUNNERS: Record<CaptionBackend, CaptionBackendRunner> = {
  openai: transcribeWithOpenAiWhisper,
  local: transcribeWithLocalWhisper,
};

export const resolveCaptionBackend = (value?: string | null): CaptionBackend => {
  const requested = value?.trim().toLowerCase();
  const envDefault = process.env.CAPTION_BACKEND?.trim().toLowerCase();
  const candidate = requested || envDefault || "openai";
  return captionBackendSchema.parse(candidate);
};

export const transcribeWithBackend = async (
  input: CaptionBackendInput & { backend?: string | null }
) => {
  const backend = resolveCaptionBackend(input.backend);
  const runner = BACKEND_RUNNERS[backend];
  logger.info({ backend, contentId: input.contentId, mode: input.mode }, "Caption transcription started.");
  const result = await runner(input);
  return {
    ...result,
    backend,
  } as CaptionDocument;
};
