export type RenderProgress = {
  id: string;
  rendered: number;
  total: number;
  progress: number;
  eta?: string;
};
