import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  applyRecordingRecoveryClaim,
  classifyOrphanObject,
  classifyRecordingRecovery,
  isAudioRetentionDue,
  isRecordingClaimStale,
  RECORDING_STALE_AFTER_MS,
  readyTimes,
  recordingPath,
} from "../lib/audio/recording-bank-helpers.ts";
import { decodeAppRoute, encodeAppRoute } from "../lib/app-route-state.ts";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");
const userId = "11111111-1111-4111-8111-111111111111";
const recordingId = "22222222-2222-4222-8222-222222222222";

test("recording recovery has an explicit bounded stale threshold", () => {
  const updatedAt = "2026-09-12T00:00:00.000Z";
  assert.equal(RECORDING_STALE_AFTER_MS, 120_000);
  assert.equal(
    isRecordingClaimStale(updatedAt, new Date("2026-09-12T00:01:59.999Z")),
    false,
  );
  assert.equal(
    isRecordingClaimStale(updatedAt, new Date("2026-09-12T00:02:00.000Z")),
    true,
  );
});

test("idempotency state machine locks active work and reclaims stale work once", () => {
  const active = {
    status: "processing" as const,
    storage_path: `${userId}/${recordingId}.webm`,
    updated_at: "2026-09-12T00:00:00.000Z",
    processing_token: "11111111-aaaa-4aaa-8aaa-111111111111",
  };
  assert.deepEqual(
    classifyRecordingRecovery(active, new Date("2026-09-12T00:00:30Z")),
    { kind: "locked" },
  );
  const claimed = applyRecordingRecoveryClaim(
    active,
    "22222222-bbbb-4bbb-8bbb-222222222222",
    new Date("2026-09-12T00:02:00Z"),
  );
  assert.deepEqual(claimed.decision, { kind: "claim", source: "stored" });
  assert.equal(claimed.recording.status, "processing");
  assert.equal(
    claimed.recording.processing_token,
    "22222222-bbbb-4bbb-8bbb-222222222222",
  );
  assert.deepEqual(
    classifyRecordingRecovery(
      claimed.recording,
      new Date("2026-09-12T00:02:01Z"),
    ),
    { kind: "locked" },
  );
  assert.deepEqual(
    classifyRecordingRecovery(
      { ...active, status: "ready" },
      new Date("2030-01-01T00:00:00Z"),
    ),
    { kind: "ready" },
  );
});

test("orphan upload recovery reuses exact objects and replaces conflicts", () => {
  const expected = { size: 42, mime: "audio/webm" };
  assert.equal(classifyOrphanObject(expected, expected), "reuse");
  assert.equal(
    classifyOrphanObject({ size: 43, mime: "audio/webm" }, expected),
    "replace",
  );
  assert.equal(
    classifyOrphanObject({ size: 42, mime: "audio/mp4" }, expected),
    "replace",
  );
  assert.equal(classifyOrphanObject(null, expected), "retry");
});

test("stop automatically triggers one stable recording process without send", () => {
  const recorder = read("../components/voice-recorder.tsx");
  const hook = read("../hooks/use-audio-recorder.ts");
  assert.match(recorder, /rec\.phase !== "preview"/);
  assert.match(recorder, /autoProcessedIds\.current\.has\(id\)/);
  assert.match(recorder, /autoProcessedIds\.current\.add\(id\)/);
  assert.match(recorder, /rec\.send\(processRecordingBlob\)/);
  assert.match(hook, /setRecordingId\(crypto\.randomUUID\(\)\)/);
  assert.match(hook, /sendLocked\.current = true/);
  assert.match(hook, /setPhase\("error"\)/);
  assert.doesNotMatch(recorder, /sendMessage|\/api\/chat/);
});

test("failed voice processing retains blob and stable id for retry", () => {
  const hook = read("../hooks/use-audio-recorder.ts");
  const client = read("../lib/audio/transcribe-client.ts");
  assert.match(hook, /catch \(caught\) \{\s+setPhase\("error"\)/s);
  const sendCatch = hook.match(
    /const send =[\s\S]*?catch \(caught\) \{([\s\S]*?)\r?\n      \} finally/,
  )?.[1];
  assert.ok(sendCatch);
  assert.doesNotMatch(sendCatch, /setBlob\(null\)|setRecordingId\(null\)/);
  assert.match(client, /"X-Recording-Id": recordingId/);
  assert.match(client, /\/api\/recordings/);
});

test("ready retention is exactly seven days and errors are never due", () => {
  const now = new Date("2026-09-12T00:00:00.000Z");
  const times = readyTimes(now);
  assert.equal(times.processed_at, now.toISOString());
  assert.equal(times.delete_after, "2026-09-19T00:00:00.000Z");
  assert.equal(
    isAudioRetentionDue(
      {
        status: "ready",
        storage_path: `${userId}/${recordingId}.webm`,
        delete_after: times.delete_after,
      },
      new Date("2026-09-18T23:59:59.999Z"),
    ),
    false,
  );
  assert.equal(
    isAudioRetentionDue(
      {
        status: "ready",
        storage_path: `${userId}/${recordingId}.webm`,
        delete_after: times.delete_after,
      },
      new Date(times.delete_after),
    ),
    true,
  );
  assert.equal(
    isAudioRetentionDue(
      {
        status: "error",
        storage_path: `${userId}/${recordingId}.webm`,
        delete_after: null,
      },
      new Date("2030-01-01T00:00:00Z"),
    ),
    false,
  );
});

test("recording paths are stable and owner-folder scoped", () => {
  assert.equal(
    recordingPath(userId, recordingId, "audio/webm"),
    `${userId}/${recordingId}.webm`,
  );
  assert.throws(() => recordingPath(userId, recordingId, "video/mp4"));
  assert.throws(() => recordingPath(userId, "../escape", "audio/webm"));
});

test("migration creates canonical private owner-RLS storage", () => {
  const sql = read(
    "../database/migrations/20260912_voice_recording_bank.sql",
  );
  for (const status of ["uploading", "processing", "ready", "error"]) {
    assert.match(sql, new RegExp(`'${status}'`));
  }
  assert.match(sql, /alter table public\.recordings enable row level security/);
  assert.match(sql, /revoke all on public\.recordings from anon/);
  assert.match(sql, /'recordings',\s+'recordings',\s+false/s);
  assert.match(
    sql,
    /\(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/g,
  );
  assert.doesNotMatch(sql, /recordings_storage_update/);
  assert.match(sql, /recordings_retention_idx/);
  assert.match(sql, /processing_token uuid/);
  assert.match(sql, /recordings_stale_claim_idx/);
});

test("recording APIs authenticate, scope ownership, and never expose service key", () => {
  const routes = [
    "../app/api/recordings/route.ts",
    "../app/api/recordings/[id]/route.ts",
    "../app/api/recordings/[id]/retry/route.ts",
    "../app/api/recordings/[id]/audio/route.ts",
  ];
  for (const path of routes) {
    const source = read(path);
    assert.match(source, /authorize\(req\)/);
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|createServiceClient/);
  }
  const main = read(routes[0]!);
  assert.match(main, /\.eq\("user_id", userId\)/);
  assert.match(main, /status: "uploading"/);
  assert.match(main, /storage_path: null/);
  assert.match(main, /processing_token: token/);
  assert.match(main, /processing_token: _token/);
  assert.match(main, /uploadClaimedRecording/);
  assert.ok(
    main.indexOf('.from("recordings").insert') <
      main.lastIndexOf("uploadClaimedRecording("),
  );
  const retry = read("../lib/recordings.ts");
  assert.match(retry, /classifyRecordingRecovery\(current\)/);
  assert.match(retry, /\.eq\("processing_token", processingToken\)/);
  assert.match(retry, /upsert: false/);
  assert.match(retry, /orphanDecision === "reuse"/);
  assert.match(retry, /orphanDecision === "replace"/);
});

test("signed playback stays private and manual delete is owner scoped", () => {
  const audio = read("../app/api/recordings/[id]/audio/route.ts");
  const service = read("../lib/recordings.ts");
  assert.match(audio, /createSignedUrl\(row\.storage_path, 60\)/);
  assert.doesNotMatch(audio, /getPublicUrl|publicUrl/);
  assert.match(service, /\.eq\("user_id", userId\)/g);
  assert.match(service, /\.remove\(\[row\.storage_path\]\)/);
  assert.match(service, /storage_path: null/);
});

test("cleanup keeps failures retryable and cron uses the existing secret guard", () => {
  const service = read("../lib/recordings.ts");
  const cron = read("../app/api/cron/recordings/route.ts");
  const vercel = read("../vercel.json");
  assert.match(service, /\.lte\("delete_after", now\.toISOString\(\)\)/);
  assert.match(
    service,
    /if \(removeError\) \{\s+summary\.failed \+= 1;\s+continue;/s,
  );
  assert.match(service, /\.update\(\{\s+storage_path: null/s);
  assert.match(cron, /authorizeCron\(req\)/);
  assert.match(cron, /createServiceClient\(\)/);
  assert.match(vercel, /"path": "\/api\/cron\/recordings"/);
});

test("recording bank URL deep-link round trips", () => {
  const href = encodeAppRoute({
    view: "recordings",
    date: null,
    sessionId: null,
  });
  assert.equal(href, "/app?view=recordings");
  assert.equal(decodeAppRoute("view=recordings").view, "recordings");
  const ui = read("../components/recording-bank.tsx");
  assert.match(ui, /\/api\/recordings/);
  assert.match(ui, /audioOnly=true/);
  assert.match(ui, /window\.confirm/);
});
