"use client";

import {
  type WhisperWebLanguage,
  type WhisperWebModel,
} from "@remotion/whisper-web";
import { captionDocumentSchema, type CaptionDocument } from "@/types";

export type BrowserWhisperOptions = {
  file: Blob;
  model?: WhisperWebModel;
  language?: WhisperWebLanguage | string;
  onProgress?: (progress: number) => void;
  onDownloadProgress?: (progress: number) => void;
  threads?: number;
};

const toUnitProgress = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  if (value > 1) return Math.max(0, Math.min(1, value / 100));
  return Math.max(0, Math.min(1, value));
};

const resolveLanguage = (value?: string) => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed as WhisperWebLanguage;
};

export const transcribeWithBrowserWhisper = async ({
  file,
  model = "base",
  language,
  onProgress,
  onDownloadProgress,
  threads,
}: BrowserWhisperOptions): Promise<CaptionDocument> => {
  const whisperWeb = await import("@remotion/whisper-web");
  const capability = await whisperWeb.canUseWhisperWeb(model);
  if (!capability.supported) {
    throw new Error(
      `Whisper Web is not supported in this browser (${capability.reason ?? "unknown"}).`
    );
  }

  await whisperWeb.downloadWhisperModel({
    model,
    onProgress: ({ progress }) => {
      onDownloadProgress?.(toUnitProgress(progress));
    },
  });

  const waveform = await whisperWeb.resampleTo16Khz({ file });
  const output = await whisperWeb.transcribe({
    channelWaveform: waveform,
    model,
    language: resolveLanguage(language),
    threads,
    onProgress: (progress) => {
      onProgress?.(toUnitProgress(progress));
    },
  });
  const captions = whisperWeb.toCaptions({ whisperWebOutput: output }).captions;

  return captionDocumentSchema.parse({
    backend: "browser",
    language: output.result.language || language || "en",
    generatedAt: new Date().toISOString(),
    segments: captions
      .map((caption) => ({
        text: caption.text.trim(),
        startMs: Math.max(0, Math.round(caption.startMs)),
        endMs: Math.max(
          Math.max(0, Math.round(caption.startMs)) + 1,
          Math.round(caption.endMs)
        ),
      }))
      .filter((segment) => segment.text.length > 0),
  });
};
