import {
  getAppSettings,
  updateAppSettings,
} from "@/lib/data/settings/repository";
import { settingsCaptionBackendSchema } from "@/lib/data/settings/schemas";
import { z } from "zod";

type AppSettings = Awaited<ReturnType<typeof getAppSettings>>;
type AppSettingsUpdate = Parameters<typeof updateAppSettings>[0];
type CaptionBackend = z.infer<typeof settingsCaptionBackendSchema>;

const resolveEnvCaptionBackend = (): CaptionBackend => {
  const raw = process.env.CAPTION_BACKEND?.trim().toLowerCase() ?? "openai";
  const normalized = raw;
  const parsed = settingsCaptionBackendSchema.safeParse(normalized);
  return parsed.success ? parsed.data : "openai";
};

export const getSettings = (): Promise<AppSettings> => getAppSettings();

export const updateSettings = (
  patch: AppSettingsUpdate,
  updatedBy: string | null = null
): Promise<AppSettings> => updateAppSettings(patch, updatedBy);

export const resolveCaptionBackendSetting = async (): Promise<CaptionBackend> => {
  const settings = await getAppSettings();
  return settings.captions.backend ?? resolveEnvCaptionBackend();
};
