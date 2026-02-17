import { contentModeRegistry, type ContentModeId } from "./registry";
export { contentModeRegistry, getOutputDefaultsForMode } from "./registry";

export const DEFAULT_CONTENT_MODE: ContentModeId = "video_loop";

export const getContentMode = (mode?: string) =>
  contentModeRegistry[(mode ?? DEFAULT_CONTENT_MODE) as ContentModeId] ??
  contentModeRegistry[DEFAULT_CONTENT_MODE];

const isSettingsMap = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.keys(value).some((key) => key in contentModeRegistry);
};

export const normalizeSettingsMap = (mode: string | undefined, settings: unknown) => {
  const definition = getContentMode(mode);
  if (isSettingsMap(settings)) {
    return settings as Record<string, Record<string, unknown>>;
  }
  const base =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  return { [definition.id]: base };
};

const parseModeSettings = (
  schema: (typeof contentModeRegistry)[ContentModeId]["schema"],
  input: Record<string, unknown>
) => {
  const candidate: Record<string, unknown> = { ...input };
  for (let i = 0; i < 4; i += 1) {
    const parsed = schema.safeParse(candidate);
    if (parsed.success) {
      return parsed;
    }
    const unknownKeys = parsed.error.issues
      .filter((issue) => issue.code === "unrecognized_keys")
      .flatMap((issue) =>
        "keys" in issue && Array.isArray(issue.keys) ? issue.keys : []
      );
    if (unknownKeys.length === 0) {
      return parsed;
    }
    for (const key of unknownKeys) {
      delete candidate[key];
    }
  }
  return schema.safeParse(candidate);
};

export const resolveContentSettings = (mode: string | undefined, settings: unknown) => {
  const definition = getContentMode(mode);
  const settingsMap = normalizeSettingsMap(definition.id, settings);
  const scoped = settingsMap[definition.id] ?? {};
  const cleaned =
    scoped && typeof scoped === "object"
      ? {
          ...(scoped as Record<string, unknown>),
        }
      : {};
  delete cleaned.songDurationSeconds;
  delete cleaned.fps;
  delete cleaned.width;
  delete cleaned.height;
  const parsed = parseModeSettings(
    definition.schema,
    (cleaned ?? {}) as Record<string, unknown>
  );
  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }
  return {
    mode: definition.id,
    settings: parsed.data,
  };
};

export const mergeContentSettings = (
  mode: string | undefined,
  base: unknown,
  patch: unknown
) => {
  const definition = getContentMode(mode);
  const settingsMap = normalizeSettingsMap(definition.id, base);
  const patchMap = normalizeSettingsMap(definition.id, patch);
  const merged = {
    ...(settingsMap[definition.id] ?? {}),
  } as Record<string, unknown>;
  Object.assign(merged, patchMap[definition.id] ?? {});
  delete merged.songDurationSeconds;
  delete merged.fps;
  delete merged.width;
  delete merged.height;
  const parsed = parseModeSettings(definition.schema, merged);
  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }
  return {
    mode: definition.id,
    settings: parsed.data,
  };
};
