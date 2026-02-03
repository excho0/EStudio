import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import type { Session } from "next-auth";

import { auth } from "@/auth";
import { getDrizzleDb, isPostgres } from "@/lib/drizzle/client";
import type { PostgresDrizzleDb, SqliteDrizzleDb } from "@/types";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import { getGoogleYoutubeClient } from "@/lib/publishing/google-youtube";
import { getProviderDefinition } from "@/lib/publishing/providers";

export const runtime = "nodejs";

const youtubeProviderId =
  getProviderDefinition("youtube")?.oauthProviderId ?? "google-youtube";

const getSessionEmail = (session: Session | null) =>
  session?.user?.email ?? null;

const fetchUserByEmail = async (email: string) => {
  const db = getDrizzleDb();
  if (isPostgres) {
    const [user] = await (db as PostgresDrizzleDb)
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    return user ?? null;
  }
  const [user] = await (db as SqliteDrizzleDb)
    .select()
    .from(sqliteSchema.users)
    .where(eq(sqliteSchema.users.email, email))
    .limit(1);
  return user ?? null;
};

const fetchYoutubeAccount = async (userId: string) => {
  const db = getDrizzleDb();
  if (isPostgres) {
    const [account] = await (db as PostgresDrizzleDb)
      .select({
        provider: schema.accounts.provider,
        scope: schema.accounts.scope,
        expires_at: schema.accounts.expires_at,
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
      provider: sqliteSchema.accounts.provider,
      scope: sqliteSchema.accounts.scope,
      expires_at: sqliteSchema.accounts.expires_at,
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

export async function GET(request: Request) {
  const session = await auth();
  const email = getSessionEmail(session);
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await fetchUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const account = await fetchYoutubeAccount(user.id);
  if (!account) {
    return NextResponse.json(
      { error: "YouTube account not connected." },
      { status: 404 }
    );
  }

  try {
    const { youtube, oauth2Client } = await getGoogleYoutubeClient(user.id);
    const credentials = oauth2Client.credentials ?? {};
    if (!credentials.access_token && !credentials.refresh_token) {
      return NextResponse.json(
        {
          error:
            "Missing OAuth tokens. Reconnect the YouTube provider to grant access.",
        },
        { status: 401 }
      );
    }
    const tokenResponse = await oauth2Client.getAccessToken();
    if (!tokenResponse?.token && !credentials.access_token) {
      return NextResponse.json(
        {
          error:
            "Unable to obtain access token. Reconnect the YouTube provider.",
        },
        { status: 401 }
      );
    }
    if (tokenResponse?.token) {
      oauth2Client.setCredentials({
        ...oauth2Client.credentials,
        access_token: tokenResponse.token,
        token_type: oauth2Client.credentials.token_type ?? "Bearer",
      });
    }
    const authHeader = await oauth2Client.getRequestHeaders(
      "https://www.googleapis.com/youtube/v3/channels"
    );
    const authorizationValue = authHeader.get?.("authorization") ?? null;
    let tokenInfo: Record<string, string> | null = null;
    if (authorizationValue) {
      try {
        const token = authorizationValue.split(" ")[1] ?? "";
        const tokenInfoResponse = await fetch(
          `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(
            token
          )}`
        );
        if (tokenInfoResponse.ok) {
          tokenInfo = (await tokenInfoResponse.json()) as Record<string, string>;
        } else {
          tokenInfo = { error: "tokeninfo_failed", status: String(tokenInfoResponse.status) };
        }
      } catch {
        tokenInfo = { error: "tokeninfo_error" };
      }
    }
    let channel:
      | {
          id: string | null;
          title: string | null;
          privacyStatus: string | null;
        }
      | null = null;
    let channelError: { message: string; status?: number } | null = null;
    let rawApi: { ok: boolean; status: number; error?: string } | null = null;
    try {
      const channelResponse = await youtube.channels.list({
        auth: oauth2Client,
        part: ["snippet", "status"],
        mine: true,
      });
      const item = channelResponse.data.items?.[0] ?? null;
      channel = item
        ? {
            id: item.id ?? null,
            title: item.snippet?.title ?? null,
            privacyStatus: item.status?.privacyStatus ?? null,
          }
        : null;
    } catch (error) {
      channelError = {
        message: error instanceof Error ? error.message : "Channel lookup failed.",
        status: (error as { code?: number })?.code,
      };
    }
    if (authorizationValue) {
      try {
        const rawResponse = await fetch(
          "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
          {
            headers: {
              Authorization: authorizationValue,
            },
          }
        );
        rawApi = {
          ok: rawResponse.ok,
          status: rawResponse.status,
        };
        if (!rawResponse.ok) {
          rawApi.error = await rawResponse.text();
        }
      } catch (error) {
        rawApi = {
          ok: false,
          status: 0,
          error: error instanceof Error ? error.message : "raw_fetch_failed",
        };
      }
    }
    const url = new URL(request.url);
    const includeVideos = url.searchParams.get("videos") === "1";
    const videos = includeVideos
      ? await youtube.search.list({
          part: ["snippet"],
          forMine: true,
          type: ["video"],
          maxResults: 5,
          order: "date",
        })
      : null;
    return NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email },
      account: {
        provider: account.provider,
        scope: account.scope ?? null,
        expiresAt: account.expires_at ?? null,
      },
      env: {
        clientId: process.env.AUTH_GOOGLE_ID ?? null,
        clientIdMatchesToken: Boolean(
          process.env.AUTH_GOOGLE_ID &&
            tokenInfo?.aud &&
            process.env.AUTH_GOOGLE_ID === tokenInfo.aud
        ),
      },
      token: {
        scope: credentials.scope ?? null,
        expiryDate: credentials.expiry_date ?? null,
        tokenType: credentials.token_type ?? null,
        hasAccessToken: Boolean(credentials.access_token),
        hasRefreshToken: Boolean(credentials.refresh_token),
        refreshTokenLength: credentials.refresh_token
          ? credentials.refresh_token.length
          : 0,
        accessTokenLength: credentials.access_token
          ? credentials.access_token.length
          : 0,
        accessTokenFromRefresh: Boolean(tokenResponse?.token),
      },
      authHeader: {
        hasAuthorization: Boolean(authorizationValue),
        authorizationPrefix: authorizationValue?.split(" ")[0] ?? null,
        headerKeys: authHeader.keys ? Array.from(authHeader.keys()) : [],
      },
      tokenInfo,
      rawApi,
      channel,
      channelError,
      videos: includeVideos
        ? (videos?.data.items ?? []).map((item) => ({
            id: item.id?.videoId ?? null,
            title: item.snippet?.title ?? null,
            publishedAt: item.snippet?.publishedAt ?? null,
          }))
        : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to verify YouTube.";
    const details =
      error && typeof error === "object"
        ? {
            name: (error as { name?: string }).name ?? null,
            code: (error as { code?: number | string }).code ?? null,
            status: (error as { status?: number }).status ?? null,
            errors: (error as { errors?: unknown }).errors ?? null,
          }
        : null;
    let authHeader: { hasAuthorization: boolean; authorizationPrefix: string | null } | null =
      null;
    try {
      const { oauth2Client } = await getGoogleYoutubeClient(user.id);
      const headers = await oauth2Client.getRequestHeaders(
        "https://www.googleapis.com/youtube/v3/channels"
      );
      const authorizationValue = headers.get?.("authorization") ?? null;
      authHeader = {
        hasAuthorization: Boolean(authorizationValue),
        authorizationPrefix: authorizationValue?.split(" ")[0] ?? null,
        headerKeys: headers.keys ? Array.from(headers.keys()) : [],
      };
    } catch {
      authHeader = null;
    }
    return NextResponse.json(
      {
        ok: false,
        error: message,
        details,
        authHeader,
      },
      { status: 500 }
    );
  }
}
