import { createSign } from "node:crypto";

function b64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function createApnsJwt(input: {
  key: string;
  keyId: string;
  teamId: string;
  nowSec?: number;
}) {
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  const header = b64url(
    JSON.stringify({ alg: "ES256", kid: input.keyId }),
  );
  const payload = b64url(
    JSON.stringify({ iss: input.teamId, iat: now }),
  );
  const signer = createSign("SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  const signature = signer.sign(input.key);
  return `${header}.${payload}.${b64url(signature)}`;
}
