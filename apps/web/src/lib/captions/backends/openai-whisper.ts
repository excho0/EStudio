import OpenAI, { toFile } from "openai";
import {
  type OpenAiVerboseTranscription,
} from "@remotion/openai-whisper";
import {
  captionDocumentSchema,
  type CaptionDocument,
  type CaptionWord,
} from "@/types";

export const transcribeWithOpenAiWhisper = async ({
  audio,
  fileName,
  language,
  onProgress: _onProgress,
}: {
  userId: string;
  contentId: string;
  mode: string;
  audio: Buffer;
  fileName: string;
  language?: string;
  onProgress?: (progress: number) => void;
}): Promise<CaptionDocument> => {
  void _onProgress;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY for OpenAI caption backend.");
  }

  const client = new OpenAI({ apiKey });
  const file = await toFile(audio, fileName || "audio.mp3", {
    type: "audio/mpeg",
  });
  const transcription = (await client.audio.transcriptions.create({
    file,
    model: process.env.CAPTION_OPENAI_MODEL?.trim() || "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
    language: language?.trim() || undefined,
  })) as OpenAiVerboseTranscription;
  const words: CaptionWord[] = (transcription.words ?? [])
    .map((word) => {
      const startMs = Math.max(0, Math.round(word.start * 1000));
      const endMs = Math.max(startMs + 1, Math.round(word.end * 1000));
      return {
        text: word.word.trim(),
        startMs,
        endMs,
      };
    })
    .filter((word) => word.text.length > 0);
  const normalized = captionDocumentSchema.parse({
    backend: "openai",
    language: transcription.language || language || "en",
    generatedAt: new Date().toISOString(),
    words,
  });
  return normalized;
};
