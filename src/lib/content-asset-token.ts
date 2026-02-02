import crypto from "crypto";

type AssetTokenPayload = {
  userId: string;
  contentId: string;
  exp: number;
};

const getSecret = () => process.env.CONTENT_ASSET_SIGNING_SECRET ?? "";

const base64UrlEncode = (value: string) =>
  Buffer.from(value, "utf-8")
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const base64UrlDecode = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  return Buffer.from(`${padded}${"=".repeat(padLength)}`, "base64").toString(
    "utf-8"
  );
};

const signPayload = (payload: string, secret: string) =>
  crypto.createHmac("sha256", secret).update(payload).digest("base64");

export const createContentAssetToken = (
  userId: string,
  contentId: string,
  ttlSeconds = 300
) => {
  const secret = getSecret();
  if (!secret) return null;
  const exp = Date.now() + Math.max(30, ttlSeconds) * 1000;
  const payload: AssetTokenPayload = { userId, contentId, exp };
  const payloadJson = JSON.stringify(payload);
  const encodedPayload = base64UrlEncode(payloadJson);
  const signature = signPayload(encodedPayload, secret);
  const encodedSignature = base64UrlEncode(signature);
  return `${encodedPayload}.${encodedSignature}`;
};

export const verifyContentAssetToken = (token: string) => {
  const secret = getSecret();
  if (!secret) return null;
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) return null;
  const expectedSignature = signPayload(payloadPart, secret);
  const signature = base64UrlDecode(signaturePart);
  const expectedBuffer = Buffer.from(expectedSignature, "utf-8");
  const signatureBuffer = Buffer.from(signature, "utf-8");
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }
  try {
    const payloadRaw = base64UrlDecode(payloadPart);
    const payload = JSON.parse(payloadRaw) as AssetTokenPayload;
    if (!payload?.userId || !payload?.contentId || !payload?.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
};
