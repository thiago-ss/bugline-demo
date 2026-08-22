/**
 * HMAC verification mirroring the ElevenLabs JS SDK webhooks.constructEvent:
 * signature header is "t=<unix-seconds>,v0=<hex>" over `${timestamp}.${rawBody}`.
 * We reject timestamps older than 30 minutes and compare digests in constant
 * time-ish fashion via Web Crypto.
 */
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  const parts = signatureHeader.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signature = parts.find((part) => part.startsWith("v0="));
  if (!timestamp || !signature) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return false;
  const ageMs = Date.now() - seconds * 1000;
  if (ageMs < 0 || ageMs > 30 * 60 * 1000) return false;
  const digest = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  return safeEqual(signature, `v0=${digest}`);
}
