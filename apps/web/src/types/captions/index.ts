import { z } from "zod";

const timedCaptionTextSchema = z.object({
  text: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
});

const captionWordSchema = timedCaptionTextSchema;

export const captionDocumentSchema = z.object({
  backend: z.string(),
  language: z.string().default("en"),
  generatedAt: z.string(),
  globalOffsetMs: z.number().int().default(0),
  words: z.array(captionWordSchema).default([]),
});

export type CaptionWord = z.infer<typeof timedCaptionTextSchema>;
export type CaptionBlock = CaptionWord & {
  words?: CaptionWord[];
};
export type CaptionDocument = z.infer<typeof captionDocumentSchema>;

const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();

export const buildWordsFromBlocks = (blocks: CaptionBlock[]): CaptionWord[] =>
  blocks
    .flatMap((block) => {
      const explicitWords =
        block.words
          ?.map((word) => {
            const startMs = Math.max(0, Math.round(word.startMs));
            const endMs = Math.max(startMs + 1, Math.round(word.endMs));
            return {
              ...word,
              text: normalizeText(word.text),
              startMs,
              endMs,
            };
          })
          .filter((word) => word.text.length > 0) ?? [];
      if (explicitWords.length > 0) {
        return explicitWords;
      }
      const rawWords = normalizeText(block.text).split(/\s+/).filter(Boolean);
      if (rawWords.length === 0) return [];
      const startMs = Math.max(0, Math.round(block.startMs));
      const endMs = Math.max(startMs + 1, Math.round(block.endMs));
      const span = Math.max(1, endMs - startMs);
      const perWordMs = span / rawWords.length;
      return rawWords.map((text, index) => {
        const wordStartMs = Math.round(startMs + index * perWordMs);
        const wordEndMs =
          index === rawWords.length - 1
            ? endMs
            : Math.round(startMs + (index + 1) * perWordMs);
        return {
          text,
          startMs: wordStartMs,
          endMs: Math.max(wordStartMs + 1, wordEndMs),
        };
      });
    })
    .sort((a, b) => a.startMs - b.startMs);

export const buildCaptionBlocksFromWords = (
  words: CaptionWord[],
  options?: { maxWordsPerSegment?: number; maxGapMs?: number }
): CaptionBlock[] => {
  const maxWordsPerSegment = Math.max(1, Math.round(options?.maxWordsPerSegment ?? 1));
  const maxGapMs = Math.max(0, Math.round(options?.maxGapMs ?? 900));
  const normalizedWords = words
    .map((word) => {
      const startMs = Math.max(0, Math.round(word.startMs));
      const endMs = Math.max(startMs + 1, Math.round(word.endMs));
      return {
        ...word,
        text: normalizeText(word.text),
        startMs,
        endMs,
      };
    })
    .filter((word) => word.text.length > 0)
    .sort((a, b) => a.startMs - b.startMs);

  if (normalizedWords.length === 0) return [];

  const blocks: CaptionBlock[] = [];
  let currentWords: CaptionWord[] = [];

  const flush = () => {
    if (currentWords.length === 0) return;
    blocks.push({
      text: currentWords.map((word) => word.text).join(" "),
      startMs: currentWords[0]!.startMs,
      endMs: currentWords[currentWords.length - 1]!.endMs,
      words: currentWords,
    });
    currentWords = [];
  };

  for (const word of normalizedWords) {
    const previous = currentWords[currentWords.length - 1] ?? null;
    const gapMs = previous ? word.startMs - previous.endMs : 0;
    const shouldSplit =
      currentWords.length >= maxWordsPerSegment ||
      (previous !== null && gapMs >= maxGapMs);
    if (shouldSplit) {
      flush();
    }
    currentWords.push(word);
  }

  flush();
  return blocks;
};

export const deriveCaptionBlocks = (
  document: Pick<CaptionDocument, "words">,
  options?: { maxWordsPerSegment?: number; maxGapMs?: number }
) => buildCaptionBlocksFromWords(document.words, options);
