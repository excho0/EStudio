export type RenderItem = {
  name: string;
  size: number;
  mtimeMs: number;
  assetUrl: string;
};

export type RenderListResponse = {
  page: number;
  limit: number;
  total: number;
  items: RenderItem[];
};
