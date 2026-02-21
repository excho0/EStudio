import {
  handleContentAssetOptions,
  handleGetContentAsset,
} from "@/lib/api/content/asset";

export const runtime = "nodejs";

export const OPTIONS = handleContentAssetOptions;
export const GET = handleGetContentAsset;
