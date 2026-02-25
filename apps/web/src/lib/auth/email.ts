import nodemailer from "nodemailer";
import { createElement } from "react";
import { render } from "@react-email/render";
import { getLogger } from "@/lib/logging";
import { EmailChangeVerificationTemplate } from "@/lib/email";
import { APP_NAME } from "@/lib/shared/constants";
import { getBaseUrl } from "@/lib/shared/url";

const logger = getLogger("auth-email");


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
    logger.warn(
      { confirmUrl },
      "SMTP_FROM is not configured. Email change link generated only."
    );
    return { confirmUrl };
  }

  const transport = getTransport();
  if (!transport) {
    logger.warn(
      { confirmUrl },
      "SMTP transport is not configured. Email change link generated only."
    );
    return { confirmUrl };
  }

  const subject = "Confirm your new email";
  const emailComponent = createElement(EmailChangeVerificationTemplate, {
    greeting,
    confirmUrl,
    appName: APP_NAME,
    logoUrl: `${baseUrl}/favicon.png`,
  });
  const html = await render(emailComponent);
  const text = await render(emailComponent, { plainText: true });

  await transport.sendMail({
    from,
    to: params.to,
    subject,
    text,
    html,
  });

  return { confirmUrl };
};
