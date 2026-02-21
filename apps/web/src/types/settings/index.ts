import { z } from "zod";
import {
  appSettingsSchema,
  appSettingsUpdateSchema,
  settingsResponseSchema,
  settingsUpdateRequestSchema,
  settingsUpdateResponseSchema,
} from "@/lib/data/settings/schemas";

export type AppSettings = z.infer<typeof appSettingsSchema>;
export type AppSettingsUpdate = z.infer<typeof appSettingsUpdateSchema>;
export type SettingsResponse = z.infer<typeof settingsResponseSchema>;
export type SettingsUpdateRequest = z.infer<typeof settingsUpdateRequestSchema>;
export type SettingsUpdateResponse = z.infer<typeof settingsUpdateResponseSchema>;
