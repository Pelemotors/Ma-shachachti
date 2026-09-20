import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";
import { normalizePhoneE164 } from "../lib/phone.ts";
import { inviteUsable, hashInviteToken } from "../lib/household.ts";
import { detectConflicts, itemFromExplicitCalendarAction } from "../lib/day-plan.ts";
import { mapGoogleEvent } from "../lib/calendar.ts";
import {
  encryptTokenEnvelope,
  decryptTokenEnvelope,
  calendarEncryptionReady,
} from "../lib/crypto/token-envelope.ts";
import { sanitizeTelemetryMetadata } from "../lib/observability.ts";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("phone normalization is E.164 and rejects junk", () => {
  assert.equal(normalizePhoneE164("0501234567"), "+972501234567");
  assert.equal(normalizePhoneE164("+972501234567"), "+972501234567");
  assert.equal(normalizePhoneE164(""), null);
  assert.throws(() => normalizePhoneE164("123"), /invalid_phone/);
});

test("invite expiry and hash are one-way", () => {
  const hash = hashInviteToken("secret-token");
  assert.equal(hash.length, 64);
  assert.notEqual(hash, "secret-token");
  assert.equal(
    inviteUsable({
      expires_at: new Date(Date.now() + 1000).toISOString(),
      accepted_at: null,
      revoked_at: null,
    }),
    true,
  );
  assert.equal(
    inviteUsable({
      expires_at: new Date(Date.now() + 1000).toISOString(),
      accepted_at: new Date().toISOString(),
      revoked_at: null,
    }),
    false,
  );
});

test("calendar constraints do not auto-create plan items", () => {
  const conflicts = detectConflicts(
    [
      {
        start_at: "2026-09-20T13:00:00.000Z",
        end_at: "2026-09-20T14:00:00.000Z",
      },
    ],
    [
      {
        title: "רופא שיניים",
        start_at: "2026-09-20T13:30:00.000Z",
        end_at: "2026-09-20T14:30:00.000Z",
      },
    ],
  );
  assert.ok(conflicts.length >= 1);
  assert.match(conflicts[0].title, /רופא שיניים/);
  const explicit = itemFromExplicitCalendarAction({
    task_id: "t1",
    start_at: "2026-09-20T13:00:00.000Z",
  });
  assert.equal(explicit.source, "calendar");
  assert.equal(explicit.kind, "fixed");
});

test("calendar mapper keeps only title/start/end", () => {
  const mapped = mapGoogleEvent({
    id: "evt-1",
    summary: "רופא שיניים",
    start: { dateTime: "2026-09-20T13:00:00Z" },
    end: { dateTime: "2026-09-20T14:00:00Z" },
  });
  assert.deepEqual(Object.keys(mapped ?? {}).sort(), [
    "end_at",
    "provider_event_id",
    "start_at",
    "title",
  ]);
});

test("calendar tokens encrypt when key present", () => {
  process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("hex");
  assert.equal(calendarEncryptionReady(), true);
  const envelope = encryptTokenEnvelope(JSON.stringify({ access_token: "abc" }));
  assert.ok(envelope.token_ciphertext);
  assert.notEqual(envelope.token_ciphertext, "abc");
  const plain = decryptTokenEnvelope(envelope);
  assert.match(plain, /access_token/);
});

test("telemetry sanitizer drops content and PII keys", () => {
  const cleaned = sanitizeTelemetryMetadata({
    screen: "home",
    title: "לקנות חלב",
    phone: "+97250",
    transcript: "hello",
    prompt: "full prompt",
    latency_ms: 12,
  });
  assert.equal(cleaned.screen, "home");
  assert.equal(cleaned.latency_ms, 12);
  assert.equal(cleaned.title, undefined);
  assert.equal(cleaned.phone, undefined);
  assert.equal(cleaned.transcript, undefined);
  assert.equal(cleaned.prompt, undefined);
});

test("tasks RLS keeps own-row SELECT after household overlay", () => {
  const sql = read("database/migrations/20260920_play_release_domain.sql");
  const restore = read("database/migrations/20260920_restore_tasks_select_own.sql");
  assert.match(sql, /create policy tasks_select_own on public\.tasks/);
  assert.match(restore, /create policy tasks_select_own on public\.tasks/);
  assert.match(sql, /create policy tasks_household_select on public\.tasks/);
});

test("day_plan is SoT; tasks.planned_* is not written by saveTaskPlans", () => {
  const actions = read("lib/actions.ts");
  assert.match(actions, /updateDayPlan/);
  assert.doesNotMatch(
    actions.slice(actions.indexOf("export async function saveTaskPlans")),
    /planned_start_at: planned.start/,
  );
});

test("privacy and contract docs exist for 2026-09-20", () => {
  assert.match(read("app/privacy/page.tsx"), /2026-09-20/);
  assert.match(read("app/privacy/page.tsx"), /טלפון/);
  assert.match(read("app/privacy/page.tsx"), /יומן/);
  assert.ok(existsSync(new URL("../docs/google-play-release-data-contract.md", import.meta.url)));
  assert.ok(existsSync(new URL("../docs/data-processors-release-audit.md", import.meta.url)));
  assert.ok(existsSync(new URL("../database/migrations/20260920_play_release_domain.sql", import.meta.url)));
});

test("oauth buttons stay disabled without credentials", () => {
  const calendar = read("app/api/calendar/route.ts");
  assert.match(calendar, /calendarOAuthConfigured/);
  assert.match(calendar, /חיבור היומן אינו מוגדר/);
});
