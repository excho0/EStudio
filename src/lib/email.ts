import nodemailer from "nodemailer";

const getBaseUrl = () => {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_URL) {
    const base = process.env.VERCEL_URL.startsWith("http")
      ? process.env.VERCEL_URL
      : `https://${process.env.VERCEL_URL}`;
    return base;
  }
  return "http://localhost:3000";
};

const getTransport = () => {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !port || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true",
    requireTLS: process.env.SMTP_REQUIRE_TLS === "true",
    auth: {
      user,
      pass,
    },
  });
};

export const sendEmailChangeVerification = async (params: {
  to: string;
  token: string;
  name?: string | null;
  baseUrl?: string;
}) => {
  const from = process.env.SMTP_FROM;
  const baseUrl = params.baseUrl ?? getBaseUrl();
  const confirmUrl = `${baseUrl}/api/user/profile/confirm-email?token=${params.token}`;
  const greeting = params.name ? `Hi ${params.name},` : "Hi,";

  if (!from) {
    console.warn("SMTP_FROM is not configured. Email change link:", confirmUrl);
    return { confirmUrl };
  }

  const transport = getTransport();
  if (!transport) {
    console.warn("SMTP is not configured. Email change link:", confirmUrl);
    return { confirmUrl };
  }

  const subject = "Confirm your new email";
  const text = `${greeting}\n\nWe received a request to change the email for your Excho Studio account.\n\nConfirm your new email:\n${confirmUrl}\n\nIf you did not request this, you can ignore this message.\n`;
  const html = `
    <p>${greeting}</p>
    <p>We received a request to change the email for your Excho Studio account.</p>
    <p><a href="${confirmUrl}">Confirm your new email</a></p>
    <p>If you did not request this, you can ignore this message.</p>
  `;

  await transport.sendMail({
    from,
    to: params.to,
    subject,
    text,
    html,
  });

  return { confirmUrl };
};
