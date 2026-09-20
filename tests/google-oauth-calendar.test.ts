import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  CalendarReconnectError,
  assertServerOwnedCalendarBody,
  calendarOAuthConfigured,
  calendarRedirectUri,
  evaluateOAuthStateRow,
  hashOAuthState,
  mapGoogleEvent,
  mergeCalendarTokens,
  PRODUCTION_CALENDAR_REDIRECT_URI,
  refreshGoogleCalendarAccessToken,
} from "../lib/calendar.ts";
import {
  calendarEncryptionReady,
  decryptTokenEnvelope,
  encryptTokenEnvelope,
} from "../lib/crypto/token-envelope.ts";
import {
  googleAudiencesFromEnv,
  googleSignInWebClientId,
  verifyJwtWithJwks,
} from "../lib/auth/verify-jwt.ts";
import { mapNativeGoogleFailure } from "../lib/auth/google-native-errors.ts";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("googleAudiencesFromEnv accepts android, web, and calendar fallback", () => {
  withEnv(
    {
      GOOGLE_ANDROID_CLIENT_ID: "android.apps.googleusercontent.com",
      GOOGLE_WEB_CLIENT_ID: "web.apps.googleusercontent.com",
      GOOGLE_CALENDAR_CLIENT_ID: "cal.apps.googleusercontent.com",
    },
    () => {
      assert.deepEqual(googleAudiencesFromEnv(), [
        "android.apps.googleusercontent.com",
        "web.apps.googleusercontent.com",
        "cal.apps.googleusercontent.com",
      ]);
    },
  );
  withEnv(
    {
      GOOGLE_ANDROID_CLIENT_ID: undefined,
      GOOGLE_WEB_CLIENT_ID: undefined,
      GOOGLE_CALENDAR_CLIENT_ID: "cal.apps.googleusercontent.com",
    },
    () => {
      assert.deepEqual(googleAudiencesFromEnv(), ["cal.apps.googleusercontent.com"]);
      assert.equal(googleSignInWebClientId(), "cal.apps.googleusercontent.com");
    },
  );
  withEnv(
    {
      GOOGLE_ANDROID_CLIENT_ID: undefined,
      GOOGLE_WEB_CLIENT_ID: undefined,
      GOOGLE_CALENDAR_CLIENT_ID: undefined,
    },
    () => {
      assert.deepEqual(googleAudiencesFromEnv(), []);
    },
  );
});

test("calendarOAuthConfigured requires id, secret, and valid encryption key", () => {
  withEnv(
    {
      GOOGLE_CALENDAR_CLIENT_ID: undefined,
      GOOGLE_CALENDAR_CLIENT_SECRET: "secret",
      CALENDAR_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("hex"),
    },
    () => assert.equal(calendarOAuthConfigured(), false),
  );
  withEnv(
    {
      GOOGLE_CALENDAR_CLIENT_ID: "cal-id",
      GOOGLE_CALENDAR_CLIENT_SECRET: undefined,
      CALENDAR_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("hex"),
    },
    () => assert.equal(calendarOAuthConfigured(), false),
  );
  withEnv(
    {
      GOOGLE_CALENDAR_CLIENT_ID: "cal-id",
      GOOGLE_CALENDAR_CLIENT_SECRET: "secret",
      CALENDAR_TOKEN_ENCRYPTION_KEY: "too-short",
    },
    () => assert.equal(calendarOAuthConfigured(), false),
  );
  withEnv(
    {
      GOOGLE_CALENDAR_CLIENT_ID: "cal-id",
      GOOGLE_CALENDAR_CLIENT_SECRET: "secret",
      CALENDAR_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("hex"),
    },
    () => assert.equal(calendarOAuthConfigured(), true),
  );
});

test("oauth state is hashed, one-time, and expiry-checked", () => {
  const raw = "one-time-state";
  const hash = hashOAuthState(raw);
  assert.equal(hash.length, 64);
  assert.notEqual(hash, raw);
  assert.deepEqual(evaluateOAuthStateRow(null), { ok: false, reason: "unknown" });
  assert.deepEqual(
    evaluateOAuthStateRow({
      user_id: "u1",
      expires_at: new Date(Date.now() - 1000).toISOString(),
    }),
    { ok: false, reason: "expired" },
  );
  const valid = evaluateOAuthStateRow({
    user_id: "u1",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
  assert.deepEqual(valid, { ok: true, userId: "u1" });
  const used = new Set<string>();
  const claim = (state: string) => {
    const key = hashOAuthState(state);
    if (used.has(key)) return { ok: false as const, reason: "unknown" as const };
    used.add(key);
    return evaluateOAuthStateRow({
      user_id: "u1",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
  };
  assert.equal(claim(raw).ok, true);
  assert.equal(claim(raw).ok, false);
});

test("token envelope never stores plaintext and rejects invalid keys", () => {
  withEnv({ CALENDAR_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("hex") }, () => {
    assert.equal(calendarEncryptionReady(), true);
    const envelope = encryptTokenEnvelope(JSON.stringify({ access_token: "abc", refresh_token: "r1" }));
    assert.ok(!JSON.stringify(envelope).includes("abc"));
    assert.ok(!JSON.stringify(envelope).includes("r1"));
    const plain = decryptTokenEnvelope(envelope);
    assert.match(plain, /access_token/);
    assert.match(plain, /r1/);
  });
  withEnv({ CALENDAR_TOKEN_ENCRYPTION_KEY: "nope" }, () => {
    assert.equal(calendarEncryptionReady(), false);
    assert.throws(() => encryptTokenEnvelope("x"), /calendar_encryption_unconfigured/);
  });
});

test("token refresh keeps old refresh_token and treats invalid_grant as reconnect", async () => {
  const previous = {
    access_token: "old-access",
    refresh_token: "keep-me",
    expires_at: 1,
    scopes: "https://www.googleapis.com/auth/calendar.events.readonly",
  };
  const refreshed = mergeCalendarTokens(previous, {
    access_token: "new-access",
    expires_in: 3600,
  });
  assert.equal(refreshed.access_token, "new-access");
  assert.equal(refreshed.refresh_token, "keep-me");
  assert.ok((refreshed.expires_at ?? 0) > Date.now());

  withEnv(
    {
      GOOGLE_CALENDAR_CLIENT_ID: "cal-id",
      GOOGLE_CALENDAR_CLIENT_SECRET: "secret",
    },
    () => undefined,
  );
  process.env.GOOGLE_CALENDAR_CLIENT_ID = "cal-id";
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "secret";
  await assert.rejects(
    () =>
      refreshGoogleCalendarAccessToken(previous, async () =>
        new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
      ),
    (error: unknown) => error instanceof CalendarReconnectError,
  );
  delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
  delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
});

test("Google event mapping covers timed, all-day, and missing fields", () => {
  const timed = mapGoogleEvent({
    id: "evt-1",
    summary: "רופא",
    start: { dateTime: "2026-09-20T13:00:00Z" },
    end: { dateTime: "2026-09-20T14:00:00Z" },
  });
  assert.equal(timed?.provider_event_id, "evt-1");
  assert.equal(timed?.calendar_ref, "primary");
  const allDay = mapGoogleEvent({
    id: "evt-2",
    start: { date: "2026-09-21" },
    end: { date: "2026-09-22" },
  });
  assert.ok(allDay?.start_at);
  assert.equal(mapGoogleEvent({ summary: "no-id", start: { dateTime: "x" }, end: { dateTime: "y" } }), null);
  assert.equal(mapGoogleEvent({ id: "evt-3" }), null);
  assert.equal(mapGoogleEvent({ id: "evt-4", status: "cancelled", start: { dateTime: "x" }, end: { dateTime: "y" } }), null);
});

test("calendar API rejects client tokens/events and keeps oauth start authenticated", () => {
  assert.throws(
    () => assertServerOwnedCalendarBody({ access_token: "leak" }),
    /השרת הוא הבעלים/,
  );
  assert.throws(
    () => assertServerOwnedCalendarBody({ events: [{ id: "1" }] }),
    /השרת הוא הבעלים/,
  );
  assert.doesNotThrow(() => assertServerOwnedCalendarBody({}));
  const start = read("app/api/calendar/oauth/start/route.ts");
  assert.match(start, /authorize\(req\)/);
  assert.match(start, /createCalendarOAuthState/);
  const calendar = read("app/api/calendar/route.ts");
  assert.match(calendar, /assertServerOwnedCalendarBody/);
  assert.match(calendar, /action === "sync"/);
  assert.match(calendar, /action === "disconnect"/);
  assert.doesNotMatch(calendar, /body\.access_token\)/);
});

test("native google failures map cancellation and missing identity without leaking tokens", () => {
  assert.equal(mapNativeGoogleFailure("SIGN_IN_CANCELLED").status, "cancelled");
  assert.equal(mapNativeGoogleFailure("12501").status, "cancelled");
  const missing = mapNativeGoogleFailure("DEVELOPER_ERROR");
  assert.equal(missing.status, "unavailable");
  const identity = read("apps/mobile/src/auth/googleIdentity.ts");
  assert.match(identity, /idToken/);
  assert.doesNotMatch(identity, /console\.(log|info|debug).*idToken/);
  assert.match(read("apps/mobile/src/auth/session.ts"), /exchangeNativeIdentity/);
  assert.match(read("app/api/auth/native/route.ts"), /verifyNativeProvider/);
});

test("server rejects Google identity token with the wrong audience", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "g1" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: "https://accounts.google.com",
      aud: "wrong-client",
      sub: "google-sub",
      exp: Math.floor(Date.now() / 1000) + 600,
    }),
  ).toString("base64url");
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey).toString(
    "base64url",
  );
  assert.throws(
    () =>
      verifyJwtWithJwks({
        token: `${header}.${payload}.${signature}`,
        jwks: [{ kid: "g1", kty: "RSA", n: jwk.n, e: jwk.e }],
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: ["android.apps.googleusercontent.com"],
      }),
    /invalid_audience/,
  );
});

test("release gate and docs no longer treat GOOGLE_NATIVE_CLIENT_ID or Apple as Android blockers", () => {
  const gate = read("scripts/release/google-play-release-ready-gate.mjs");
  assert.match(gate, /GOOGLE_ANDROID_CLIENT_ID/);
  assert.match(gate, /GOOGLE_CALENDAR_CLIENT_ID/);
  assert.doesNotMatch(gate, /GOOGLE_NATIVE_CLIENT_ID/);
  assert.doesNotMatch(gate, /APPLE_NATIVE_CLIENT_ID/);
  assert.match(gate, /HUMAN DEVICE TEST PASSED: not claimed/);
  assert.match(read("docs/MOBILE_PLATFORM_READINESS.md"), /com\.mashachachti\.app/);
  assert.equal(calendarRedirectUri(), PRODUCTION_CALENDAR_REDIRECT_URI);
});
