export const queryKeys = {
  dashboardStats: (range: number | "all") => ["dashboard-stats", range] as const,
  contentListBase: ["content"] as const,
  contentList: (params: {
    query: string;
    page: number;
    limit: number;
    status?: string;
    sortBy?: string;
    sortDir?: string;
  }) =>
    ["content", params] as const,
  contentItem: (id: string | undefined | null) => ["content-item", id] as const,
  contentSummary: (id: string | undefined | null) =>
    ["content-summary", id] as const,
  contentRendersSimple: (id: string | undefined | null) =>
    ["content-renders", id] as const,
  contentRenders: (id: string | undefined | null, page: number, limit: number) =>
    ["renders", id, page, limit] as const,
  rendersBase: ["renders"] as const,
  publishes: (id: string | undefined | null) => ["publishes", id] as const,
  publishesBase: ["publishes"] as const,
  publishProviders: ["publish-providers"] as const,
  publishProvider: (id: string) => ["publish-provider", id] as const,
  profile: ["profile"] as const,
  profileConnections: ["profile-connections"] as const,
  apiKeys: ["api-keys"] as const,
  metaProviders: ["meta-providers"] as const,
  settings: ["settings"] as const,
};
