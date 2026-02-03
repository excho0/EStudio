export type SettingsStats = {
  total: number;
  uploaded: number;
  rendering: number;
  rendered: number;
  failed: number;
};

export type SettingsStorage = {
  baseDir: string;
  uploadsDir: string;
  rendersDir: string;
  manifestsDir: string;
  uploadsCount: number;
  rendersCount: number;
  manifestsCount: number;
};

export type SettingsResponse = {
  storage: SettingsStorage;
  stats: SettingsStats;
};
