import NextAuth from "next-auth";
import nodemailer from "nodemailer";
import { createElement } from "react";
import { render } from "@react-email/render";
import Discord from "next-auth/providers/discord";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import type { Provider } from "next-auth/providers";
import { DrizzleAdapter } from "@auth/drizzle-adapter";

import { eventBus } from "@/lib/event-bus";
import { AuthMagicLinkTemplate } from "@/lib/email";
import { APP_NAME } from "@/lib/shared/constants";
import { getBaseUrl } from "@/lib/shared/url";
import { getProviderDefinition } from "@/lib/publishing/providers";
import {
  getDrizzleDb,
  isPostgres,
} from "@/lib/drizzle/client";
import type {
  PostgresDrizzleDb,
  SqliteDrizzleDb,
} from "@/types";
import { and, eq, sql } from "drizzle-orm";
import {
  accounts,
  accountsPg,
  authenticators,
  authenticatorsPg,
  sessions,
  sessionsPg,
  users,
  usersPg,
  verificationTokens,
  verificationTokensPg,
} from "@/lib/drizzle/schema";
import { YOUTUBE_OAUTH_PROVIDER_ID } from "@/lib/publishing/providers/youtube/constants";


const providers: Provider[] = [];

const persistOauthAccountTokens = async (params: {
  provider: string;
  providerAccountId: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: number | null;
  tokenType?: string | null;
  scope?: string | null;
  idToken?: string | null;
  sessionState?: string | null;
}) => {
  const db = getDrizzleDb();
  const values = {
    access_token: params.accessToken ?? undefined,
    refresh_token: params.refreshToken ?? undefined,
    expires_at: params.expiresAt ?? undefined,
    token_type: params.tokenType ?? undefined,
    scope: params.scope ?? undefined,
    id_token: params.idToken ?? undefined,
    session_state: params.sessionState ?? undefined,
  };

  if (isPostgres) {
    await (db as PostgresDrizzleDb)
      .update(accountsPg)
      .set(values)
      .where(
        and(
          eq(accountsPg.provider, params.provider),
          eq(accountsPg.providerAccountId, params.providerAccountId)
        )
      );
    return;
  }

  await (db as SqliteDrizzleDb)
    .update(accounts)
    .set(values)
    .where(
      and(
        eq(accounts.provider, params.provider),
        eq(accounts.providerAccountId, params.providerAccountId)
      )
    );
};

const pruneDuplicateProviderAccounts = async (params: {
  userId: string;
  provider: string;
  keepProviderAccountId: string;
}) => {
  const db = getDrizzleDb();
  if (isPostgres) {
    await (db as PostgresDrizzleDb)
      .delete(accountsPg)
      .where(
        and(
          eq(accountsPg.userId, params.userId),
          eq(accountsPg.provider, params.provider),
          sql`${accountsPg.providerAccountId} <> ${params.keepProviderAccountId}`
        )
      );
    return;
  }
  await (db as SqliteDrizzleDb)
    .delete(accounts)
    .where(
      and(
        eq(accounts.userId, params.userId),
        eq(accounts.provider, params.provider),
        sql`${accounts.providerAccountId} <> ${params.keepProviderAccountId}`
      )
    );
};

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  const youtubeProvider = getProviderDefinition("youtube");
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    })
  );

  if (youtubeProvider?.oauthProviderId) {
    providers.push(
      Google({
        id: youtubeProvider.oauthProviderId,
        name: youtubeProvider.label,
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
        allowDangerousEmailAccountLinking: true,
        authorization: youtubeProvider.oauthAuthorizationParams
          ? { params: youtubeProvider.oauthAuthorizationParams }
          : undefined,
      })
    );
  }
}

if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

if (process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET) {
  providers.push(
    Discord({
      clientId: process.env.AUTH_DISCORD_ID,
      clientSecret: process.env.AUTH_DISCORD_SECRET,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

if (
  process.env.SMTP_HOST &&
  process.env.SMTP_PORT &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASSWORD &&
  process.env.SMTP_FROM
) {
  providers.push(
    Nodemailer({
      server: {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === "true",
        requireTLS: process.env.SMTP_REQUIRE_TLS === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      },
      from: process.env.SMTP_FROM,
      async sendVerificationRequest({ identifier, url, provider }) {
        const baseUrl = getBaseUrl();
        const subject = `Sign in to ${APP_NAME}`;

        const emailComponent = createElement(AuthMagicLinkTemplate, {
          email: identifier,
          signInUrl: url,
          appName: APP_NAME,
          logoUrl: `${baseUrl}/favicon.png`,
        });

        const html = await render(emailComponent);
        const text = await render(emailComponent, { plainText: true });

        const transport = nodemailer.createTransport(provider.server);
        const result = await transport.sendMail({
          to: identifier,
          from: provider.from,
          subject,
          text,
          html,
        });

        const failed = [...(result.rejected || []), ...(result.pending || [])].filter(Boolean);
        if (failed.length > 0) {
          throw new Error(`Email(s) (${failed.join(", ")}) could not be sent`);
        }
      },
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(
    getDrizzleDb(),
    isPostgres
      ? {
          usersTable: usersPg,
          accountsTable: accountsPg,
          sessionsTable: sessionsPg,
          verificationTokensTable: verificationTokensPg,
          authenticatorsTable: authenticatorsPg,
        }
      : {
          usersTable: users,
          accountsTable: accounts,
          sessionsTable: sessions,
          verificationTokensTable: verificationTokens,
          authenticatorsTable: authenticators,
        }
  ),
  providers,
  session: { strategy: "database" },
  pages: {
    signIn: "/login",
  },
  events: {
    signIn: async ({ user, account }) => {
      if (
        !user?.id ||
        !account?.provider ||
        !account.providerAccountId ||
        account.provider !== YOUTUBE_OAUTH_PROVIDER_ID
      ) {
        return;
      }

      await persistOauthAccountTokens({
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        accessToken: account.access_token,
        refreshToken: account.refresh_token,
        expiresAt: account.expires_at,
        tokenType: account.token_type,
        scope: account.scope,
        idToken: account.id_token,
        sessionState:
          typeof account.session_state === "string" ? account.session_state : undefined,
      });

      await pruneDuplicateProviderAccounts({
        userId: user.id,
        provider: account.provider,
        keepProviderAccountId: account.providerAccountId,
      });
    },
    linkAccount: async ({ user, account }) => {
      if (!user?.id || !account?.provider) return;
      void eventBus.emit("provider.connection.created", {
        userId: user.id,
        provider: account.provider,
        providerAccountId: account.providerAccountId ?? null,
      });
    },
  },
  secret: process.env.AUTH_SECRET,
  trustHost: true,
});
