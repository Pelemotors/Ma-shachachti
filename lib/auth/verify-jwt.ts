import { createHash, createPublicKey, createVerify } from "node:crypto";

export type VerifiedProviderToken = {
  provider: "apple" | "google";
  subject: string;
  email: string | null;
  emailVerified: boolean;
  nonce?: string | null;
};

type Jwk = {
  kid?: string;
  kty: string;
  n?: string;
  e?: string;
  alg?: string;
  use?: string;
};

function b64urlToBuffer(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

function decodeJwtParts(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid_jwt");
  const header = JSON.parse(b64urlToBuffer(parts[0]!).toString("utf8")) as {
    kid?: string;
    alg?: string;
  };
  const payload = JSON.parse(b64urlToBuffer(parts[1]!).toString("utf8")) as Record<
    string,
    unknown
  >;
  return { header, payload, signingInput: `${parts[0]}.${parts[1]}`, signature: parts[2]! };
}

function verifyRs256(signingInput: string, signature: string, jwk: Jwk) {
  if (!jwk.n || !jwk.e) return false;
  const key = createPublicKey({
    key: {
      kty: "RSA",
      n: jwk.n,
      e: jwk.e,
    },
    format: "jwk",
  });
  const verifier = createVerify("RSA-SHA256");
  verifier.update(signingInput);
  verifier.end();
  return verifier.verify(key, b64urlToBuffer(signature));
}

export function hashNonce(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export function assertFresh(exp: unknown, nowMs = Date.now()) {
  if (typeof exp !== "number" || exp * 1000 < nowMs - 30_000) {
    throw new Error("expired_token");
  }
}

export function verifyJwtWithJwks(input: {
  token: string;
  jwks: Jwk[];
  issuer: string | string[];
  audience: string | string[];
  nonce?: string | null;
}): Record<string, unknown> {
  const decoded = decodeJwtParts(input.token);
  if (decoded.header.alg !== "RS256") throw new Error("unsupported_alg");
  const jwk =
    input.jwks.find((row) => row.kid && row.kid === decoded.header.kid) ??
    input.jwks[0];
  if (!jwk || !verifyRs256(decoded.signingInput, decoded.signature, jwk)) {
    throw new Error("invalid_signature");
  }
  const iss = String(decoded.payload.iss ?? "");
  const issuers = Array.isArray(input.issuer) ? input.issuer : [input.issuer];
  if (!issuers.includes(iss)) throw new Error("invalid_issuer");
  const aud = decoded.payload.aud;
  const audiences = Array.isArray(input.audience) ? input.audience : [input.audience];
  const audValues = Array.isArray(aud) ? aud.map(String) : [String(aud ?? "")];
  if (!audValues.some((value) => audiences.includes(value))) {
    throw new Error("invalid_audience");
  }
  assertFresh(decoded.payload.exp);
  if (input.nonce) {
    const tokenNonce = String(decoded.payload.nonce ?? "");
    if (tokenNonce && tokenNonce !== input.nonce && tokenNonce !== hashNonce(input.nonce)) {
      throw new Error("invalid_nonce");
    }
  }
  return decoded.payload;
}

export async function fetchJson(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("jwks_fetch_failed");
  return response.json();
}

export async function verifyAppleIdentityToken(input: {
  token: string;
  audience: string[];
  nonce?: string | null;
  fetchKeys?: typeof fetchJson;
}): Promise<VerifiedProviderToken> {
  if (!input.audience.length) throw new Error("missing_apple_audience");
  const fetchKeys = input.fetchKeys ?? fetchJson;
  const body = (await fetchKeys("https://appleid.apple.com/auth/keys")) as {
    keys?: Jwk[];
  };
  const payload = verifyJwtWithJwks({
    token: input.token,
    jwks: body.keys ?? [],
    issuer: "https://appleid.apple.com",
    audience: input.audience,
    nonce: input.nonce,
  });
  return {
    provider: "apple",
    subject: String(payload.sub ?? ""),
    email: typeof payload.email === "string" ? payload.email : null,
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    nonce: typeof payload.nonce === "string" ? payload.nonce : null,
  };
}

export async function verifyGoogleIdentityToken(input: {
  token: string;
  audience: string[];
  fetchKeys?: typeof fetchJson;
}): Promise<VerifiedProviderToken> {
  if (!input.audience.length) throw new Error("missing_google_audience");
  const fetchKeys = input.fetchKeys ?? fetchJson;
  const body = (await fetchKeys("https://www.googleapis.com/oauth2/v3/certs")) as {
    keys?: Jwk[];
  };
  const payload = verifyJwtWithJwks({
    token: input.token,
    jwks: body.keys ?? [],
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: input.audience,
  });
  return {
    provider: "google",
    subject: String(payload.sub ?? ""),
    email: typeof payload.email === "string" ? payload.email : null,
    emailVerified: payload.email_verified === true,
  };
}

export function appleAudiencesFromEnv() {
  return [
    process.env.APPLE_BUNDLE_ID,
    process.env.APPLE_SERVICE_ID,
    process.env.APPLE_CLIENT_ID,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

export function googleAudiencesFromEnv() {
  return [
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    process.env.GOOGLE_WEB_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}
