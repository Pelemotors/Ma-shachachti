import { generateKeyPairSync, sign } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { decideIdentityLink, notificationLogicalKey } from "../lib/auth/identity.ts";
import { kindEnabled } from "../lib/notifications/record.ts";
import { verifyJwtWithJwks, hashNonce } from "../lib/auth/verify-jwt.ts";
import { parseDeepLink, resumePathAfterAuth, loginPathWithResume } from "../lib/native/deep-links.ts";
import {
  enqueuePendingMutation,
  completePendingMutation,
  readPendingMutations,
} from "../lib/native/pending-queue.ts";
import { interpretCapture } from "../lib/capture/ingest.ts";
import { createWebNativeCapability } from "../lib/native/web-adapter.ts";
import { mobileVersionPolicy } from "../lib/mobile-version.ts";
import { sanitizeTelemetryMetadata } from "../lib/observability.ts";
import { isValidTimeZone, todayContext, dateTimeToUtc } from "../lib/time.ts";
import { readFileSync } from "node:fs";

test("identity linking rejects takeover of existing subject", () => {
  const decision = decideIdentityLink({
    provider: "apple",
    providerSubject: "sub-1",
    existingBySubject: {
      userId: "user-a",
      provider: "apple",
      providerSubject: "sub-1",
    },
    authenticatedUserId: "user-b",
  });
  assert.equal(decision.action, "reject_takeover");
});

test("identity create when no subject and no session", () => {
  const decision = decideIdentityLink({
    provider: "google",
    providerSubject: "g-1",
    existingBySubject: null,
    authenticatedUserId: null,
  });
  assert.equal(decision.action, "create");
});

test("identity link when authenticated without existing subject", () => {
  const decision = decideIdentityLink({
    provider: "apple",
    providerSubject: "a-2",
    existingBySubject: null,
    authenticatedUserId: "user-a",
  });
  assert.equal(decision.action, "link");
  assert.equal(decision.userId, "user-a");
});

test("jwt verification checks issuer audience and signature", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "k1" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: "https://appleid.apple.com",
      aud: "il.co.mashachachti.app",
      sub: "apple-sub",
      exp: Math.floor(Date.now() / 1000) + 600,
      nonce: hashNonce("abc"),
    }),
  ).toString("base64url");
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey).toString(
    "base64url",
  );
  const token = `${header}.${payload}.${signature}`;
  const decoded = verifyJwtWithJwks({
    token,
    jwks: [{ kid: "k1", kty: "RSA", n: jwk.n, e: jwk.e }],
    issuer: "https://appleid.apple.com",
    audience: "il.co.mashachachti.app",
    nonce: "abc",
  });
  assert.equal(decoded.sub, "apple-sub");
});

test("deep links preserve logged-out resume path", () => {
  const parsed = parseDeepLink("https://mashachachti.co.il/app?view=tasks");
  assert.equal(parsed?.view, "tasks");
  assert.equal(resumePathAfterAuth("https://mashachachti.co.il/app?view=schedule&date=2026-09-16"), "/app?view=schedule&date=2026-09-16");
  assert.match(loginPathWithResume("/app?view=chat"), /next=/);
});

test("pending mutations are idempotent by id", () => {
  const memory = new Map<string, string>();
  const storage = {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
  } as Storage;
  enqueuePendingMutation({ id: "m1", kind: "task", payload: { a: 1 } }, storage);
  enqueuePendingMutation({ id: "m1", kind: "task", payload: { a: 2 } }, storage);
  assert.equal(readPendingMutations(storage).length, 1);
  completePendingMutation("m1", storage);
  assert.equal(readPendingMutations(storage).length, 0);
});

test("unified capture routes bank mic to brain dump", () => {
  const intent = interpretCapture({
    kind: "bank_mic",
    recordingId: "11111111-1111-4111-8111-111111111111",
    transcript: "לקנות חלב",
    mutationId: "22222222-2222-4222-8222-222222222222",
  });
  assert.equal(intent.type, "brain_dump");
});

test("web adapter does not invent deep links from the current URL", async () => {
  const web = createWebNativeCapability();
  assert.equal(await web.getInitialDeepLink(), null);
});

test("web native adapter provides fallbacks", async () => {
  const web = createWebNativeCapability();
  assert.equal(await web.getPlatform(), "web");
  const apple = await web.authenticateWithApple();
  assert.equal(apple.status, "unavailable");
});

test("notification kind preferences honor explicit false", () => {
  assert.equal(kindEnabled({ REMINDER: false }, "REMINDER"), false);
  assert.equal(kindEnabled({ REMINDER: false }, "TASK_DUE"), true);
  assert.equal(kindEnabled(null, "REMINDER"), true);
});

test("notification logical key is stable", () => {
  assert.equal(notificationLogicalKey("REMINDER", "task-1"), "REMINDER:task-1");
});

test("version policy is prepared without force update", () => {
  const policy = mobileVersionPolicy({
    platform: "ios",
    version: "0.2.0-lean",
    build: "1",
  });
  assert.equal(policy.supported, true);
  assert.equal(policy.updateRequired, false);
});

test("telemetry sanitizer strips secrets", () => {
  const clean = sanitizeTelemetryMetadata({
    token: "secret",
    platform: "ios",
    transcript: "full text",
  });
  assert.equal(clean.platform, "ios");
  assert.equal(clean.token, undefined);
});

test("timezone helpers accept IANA zones", () => {
  assert.equal(isValidTimeZone("Asia/Jerusalem"), true);
  assert.equal(isValidTimeZone("Not/AZone"), false);
  const ctx = todayContext(new Date("2026-09-10T17:50:00.000Z"), "Asia/Jerusalem");
  assert.equal(ctx.date, "2026-09-10");
  const utc = dateTimeToUtc("2026-07-15", "17:00", "Asia/Jerusalem");
  assert.equal(utc.toISOString(), "2026-07-15T14:00:00.000Z");
});

test("architecture guards: server/domain does not import ios/android", () => {
  const files = [
    "lib/actions.ts",
    "lib/agent/openai-orchestrator.ts",
    "lib/reminder-dispatch.ts",
    "lib/auth/native-session.ts",
  ];
  for (const file of files) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /ios\/App|android\/app|MaNativePlugin/);
  }
});

test("architecture guards: no duplicate agent/task services in native folders", () => {
  const android = readFileSync(
    new URL("../android/app/src/main/java/il/co/mashachachti/app/MaNativePlugin.java", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(android, /createTask|shoppingService|schedulePlanner/);
  const ios = readFileSync(new URL("../ios/App/App/MaNativePlugin.swift", import.meta.url), "utf8");
  assert.doesNotMatch(ios, /createTask|shoppingService|schedulePlanner/);
});

test("mobile migration exists and is production-safe documentation-wise", () => {
  const sql = readFileSync(
    new URL("../database/migrations/20260916_mobile_platform_foundation.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /user_identities/);
  assert.match(sql, /user_installations/);
  assert.match(sql, /app_notifications/);
  assert.match(sql, /Production must NOT apply/);
});
