import { google, type Auth } from "googleapis";
import { and, eq } from "drizzle-orm";

import { getDrizzleDb, isPostgres, type PostgresDrizzleDb, type SqliteDrizzleDb } from "@/lib/drizzle/client";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import { getProviderDefinition } from "@/lib/publishing/providers";

const youtubeProviderId =
  getProviderDefinition("youtube")?.oauthProviderId ?? "google-youtube";

type GoogleYoutubeAccount = {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  tokenType: string | null;
  scope: string | null;
};

const fetchGoogleYoutubeAccount = async (
  userId: string
): Promise<GoogleYoutubeAccount | null> => {
  const db = getDrizzleDb();
  if (isPostgres) {
    const [account] = await (db as PostgresDrizzleDb)
      .select({
        accessToken: schema.accounts.access_token,
        refreshToken: schema.accounts.refresh_token,
        expiresAt: schema.accounts.expires_at,
        tokenType: schema.accounts.token_type,
        scope: schema.accounts.scope,
      })
      .from(schema.accounts)
      .where(
        and(
          eq(schema.accounts.userId, userId),
          eq(schema.accounts.provider, youtubeProviderId)
        )
      )
      .limit(1);
    return account ?? null;
  }
  const [account] = await (db as SqliteDrizzleDb)
    .select({
      accessToken: sqliteSchema.accounts.access_token,
      refreshToken: sqliteSchema.accounts.refresh_token,
      expiresAt: sqliteSchema.accounts.expires_at,
      tokenType: sqliteSchema.accounts.token_type,
      scope: sqliteSchema.accounts.scope,
    })
    .from(sqliteSchema.accounts)
    .where(
      and(
        eq(sqliteSchema.accounts.userId, userId),
        eq(sqliteSchema.accounts.provider, youtubeProviderId)
      )
    )
    .limit(1);
  return account ?? null;
};

const updateAccountTokens = async (
  userId: string,
  tokens: Auth.Credentials
) => {
  const db = getDrizzleDb();
  const values = {
    access_token: tokens.access_token ?? undefined,
    refresh_token: tokens.refresh_token ?? undefined,
    token_type: tokens.token_type ?? undefined,
    scope: tokens.scope ?? undefined,
    expires_at: tokens.expiry_date
      ? Math.floor(tokens.expiry_date / 1000)
      : undefined,
  };
  if (isPostgres) {
    await (db as PostgresDrizzleDb)
      .update(schema.accounts)
      .set(values)
      .where(
        and(
          eq(schema.accounts.userId, userId),
          eq(schema.accounts.provider, youtubeProviderId)
        )
      );
    return;
  }
  await (db as SqliteDrizzleDb)
    .update(sqliteSchema.accounts)
    .set(values)
    .where(
      and(
        eq(sqliteSchema.accounts.userId, userId),
        eq(sqliteSchema.accounts.provider, youtubeProviderId)
      )
    );
};

export const getGoogleYoutubeClient = async (userId: string) => {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    throw new Error("Google OAuth client is not configured.");
  }

  const account = await fetchGoogleYoutubeAccount(userId);
  if (!account?.accessToken && !account?.refreshToken) {
    throw new Error("YouTube account is not connected.");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET
  );

  oauth2Client.setCredentials({
    access_token: account.accessToken ?? undefined,
    refresh_token: account.refreshToken ?? undefined,
    token_type: account.tokenType ?? undefined,
    scope: account.scope ?? undefined,
    expiry_date: account.expiresAt ? account.expiresAt * 1000 : undefined,
  });

  oauth2Client.on("tokens", (tokens) => {
    void updateAccountTokens(userId, tokens);
  });

  const access = await oauth2Client.getAccessToken();
  if (!access?.token) {
    throw new Error("YouTube access token could not be refreshed.");
  }

  const headers = await oauth2Client.getRequestHeaders();
  const authHeader = headers.get("authorization") ?? headers.get("Authorization");
  if (!authHeader) {
    try {
      const refreshed = await oauth2Client.refreshAccessToken();
      if (refreshed?.credentials) {
        await updateAccountTokens(userId, refreshed.credentials);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to refresh token.";
      throw new Error(`YouTube token refresh failed: ${message}`);
    }
  }

  return {
    oauth2Client,
    youtube: google.youtube({ version: "v3", auth: oauth2Client }),
  };
};
