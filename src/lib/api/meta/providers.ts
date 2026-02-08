import { NextResponse } from "next/server";

export const handleGetMetaProviders = async () => {
  const oauthProviders: string[] = [];

  if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
    oauthProviders.push("google");
  }
  if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
    oauthProviders.push("github");
  }
  if (process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET) {
    oauthProviders.push("discord");
  }

  const emailEnabled = Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASSWORD &&
      process.env.SMTP_FROM
  );

  return NextResponse.json({ oauthProviders, emailEnabled });
};
