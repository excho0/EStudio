if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("server-only");
}

export {
  getSettings as getAppSettings,
  resolveCaptionBackendSetting,
  updateSettings as updateAppSettings,
} from "@/lib/data/settings/service";
