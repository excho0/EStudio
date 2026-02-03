export type AssetCacheEntry = {
  buffer: Buffer;
  contentType: string;
  size: number;
  mtimeMs: number;
  accessedAt: number;
};
