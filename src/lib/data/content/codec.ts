import { ContentItem } from "@/types";

import { contentItemSchema } from "./schemas";

export const parseColorPalette = (value: unknown) => {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry));
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : null;
    } catch {
      return null;
    }
  }
  return null;
};

export const serializeColorPalette = (value?: string[] | null) =>
  value && value.length > 0 ? JSON.stringify(value) : null;

export const normalizeContentRow = (row: unknown): ContentItem => {
  const record = row as Record<string, unknown>;
  const toIso = (value: unknown) => (value instanceof Date ? value.toISOString() : value);
  const parsed = contentItemSchema.safeParse({
    ...record,
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt),
    colorPalette: parseColorPalette(record.colorPalette),
    paletteMode: record.paletteMode ?? "auto",
    mode: record.mode ?? "video_loop",
    settings: record.settings ?? null,
    publishesCount: Number.isFinite(Number(record.publishesCount))
      ? Number(record.publishesCount)
      : 0,
  });

  if (!parsed.success) {
    throw new Error(`Invalid content row: ${parsed.error.message}`);
  }

  return parsed.data;
};
