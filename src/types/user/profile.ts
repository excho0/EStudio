export type ProfilePayload = {
  name: string;
  email: string;
  image: string | null;
  pendingEmail?: string | null;
};

export type ConnectionsResponse = {
  connections: Array<{
    provider: string;
    providerAccountId: string | null;
    profile: { image?: string | null; name?: string | null } | null;
  }>;
};
