import type { z } from "zod";
import { videoLoopSettingsSchema } from "@/lib/content/modes/schemas";

export type VideoLoopSettings = z.infer<typeof videoLoopSettingsSchema>;
