export type PaletteMode = "auto" | "manual";

export type EditFormValues = {
  title: string;
  status: string;
  mode: string;
  songDurationSeconds: string;
  fps: string;
  width: string;
  height: string;
  settings: Record<string, unknown>;
};
