import crypto from "crypto";

type AssetTokenPayload = {
  userId: string;
  contentId: string;
  exp: number;
};

const getSecret = () => process.env.CONTENT_ASSET_SIGNING_SECRET ?? "";

/**
 * Base64url helpers (RFC 4648 §5)
 */
const base64UrlEncodeBuffer = (buf: Buffer) =>
  buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const base64UrlEncodeString = (value: string) =>
  base64UrlEncodeBuffer(Buffer.from(value, "utf-8"));

const base64UrlDecodeToBuffer = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  return Buffer.from(`${padded}${"=".repeat(padLength)}`, "base64");
};

const base64UrlDecodeToString = (value: string) =>
  base64UrlDecodeToBuffer(value).toString("utf-8");

/**
 * Return raw signature bytes (Buffer) – do not stringify before comparing.
 */
const signPayload = (payloadPart: string, secret: string) =>
  crypto.createHmac("sha256", secret).update(payloadPart).digest();

export const createContentAssetToken = (
  userId: string,
  contentId: string,
  ttlSeconds = 300
) => {
  const secret = getSecret();
  if (!secret) return null;

  // TTL is in seconds; exp stored in ms since epoch (Date.now())
  const exp = Date.now() + Math.max(30, ttlSeconds) * 1000;

  const payload: AssetTokenPayload = { userId, contentId, exp };
  const encodedPayload = base64UrlEncodeString(JSON.stringify(payload));

  const sig = signPayload(encodedPayload, secret);
  const encodedSignature = base64UrlEncodeBuffer(sig);

  return `${encodedPayload}.${encodedSignature}`;
};

export const verifyContentAssetToken = (token: string) => {
  const secret = getSecret();
  if (!secret) return null;

  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) return null;

  // Verify signature using raw bytes
  const expectedSig = signPayload(payloadPart, secret);
  const providedSig = base64UrlDecodeToBuffer(signaturePart);

  if (
    providedSig.length !== expectedSig.length ||
    !crypto.timingSafeEqual(providedSig, expectedSig)
  ) {
    return null;
  }

  try {
    const payloadRaw = base64UrlDecodeToString(payloadPart);
    const payload = JSON.parse(payloadRaw) as AssetTokenPayload;

    if (!payload?.userId || !payload?.contentId || !payload?.exp) return null;
    if (Date.now() > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
};
