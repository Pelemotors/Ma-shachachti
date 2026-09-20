import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";

function loadKey() {
  const raw = (process.env.CALENDAR_TOKEN_ENCRYPTION_KEY || "").trim();
  if (!raw) return null;
  const buf = raw.length === 64 ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) return null;
  return buf;
}

export function calendarEncryptionReady() {
  return Boolean(loadKey());
}

export function encryptTokenEnvelope(plaintext: string) {
  const key = loadKey();
  if (!key) throw new Error("calendar_encryption_unconfigured");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    token_ciphertext: encrypted.toString("base64"),
    token_iv: iv.toString("base64"),
    token_tag: tag.toString("base64"),
  };
}

export function decryptTokenEnvelope(row: {
  token_ciphertext: string;
  token_iv: string;
  token_tag: string;
}) {
  const key = loadKey();
  if (!key) throw new Error("calendar_encryption_unconfigured");
  const decipher = createDecipheriv(
    ALGO,
    key,
    Buffer.from(row.token_iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(row.token_tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.token_ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
