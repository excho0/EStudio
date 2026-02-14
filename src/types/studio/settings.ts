import type { z } from "zod";
import type { settingsResponseSchema } from "@/lib/data/settings";

export type SettingsResponse = z.infer<typeof settingsResponseSchema>;
export type SettingsStorage = SettingsResponse["storage"];
export type SettingsStats = SettingsResponse["stats"];
