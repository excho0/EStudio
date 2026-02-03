export type ProviderConnectionState = {
  connected: boolean;
  needsReconnect: boolean;
  channel: { title: string | null; thumbnail: string | null } | null;
  loading: boolean;
  enabled: boolean;
};
