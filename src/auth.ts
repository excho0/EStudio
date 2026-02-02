import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import type { Provider } from "next-auth/providers";
import { DrizzleAdapter } from "@auth/drizzle-adapter";

import { getDrizzleDb, isPostgres } from "@/lib/drizzle/client";
import { getProviderDefinition } from "@/lib/publishing/providers";
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


const providers: Provider[] = [];

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
  secret: process.env.AUTH_SECRET,
  trustHost: true,
});
