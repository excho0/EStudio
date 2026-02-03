export type ProfilePayload = {
  name: string;
  email: string;
  image: string | null;
  pendingEmail?: string | null;
};

export type ConnectionsResponse = {
  connected: string[];
  profiles?: Record<string, { image?: string | null; name?: string | null }>;
};
