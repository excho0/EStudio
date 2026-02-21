import type { z } from "zod";
import type {
  editFormValuesSchema,
  paletteModeSchema,
} from "@/lib/data/content/schemas";

export type PaletteMode = z.infer<typeof paletteModeSchema>;
export type EditFormValues = z.infer<typeof editFormValuesSchema>;
