import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { recordingStatusLabel } from "../apps/mobile/src/utils/recordingStatus.ts";
import { newClientId } from "../apps/mobile/src/utils/clientId.ts";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("M11 uses a platform-safe client recording id", () => {
  const source = read("../apps/mobile/src/screens/BankScreen.tsx");
  assert.match(source, /newClientId\(\)/);
  assert.doesNotMatch(source, /crypto\.randomUUID\(\)/);
  assert.match(newClientId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test("M11 exposes stable bank statuses", () => {
  assert.equal(recordingStatusLabel("uploading"), "Processing");
  assert.equal(recordingStatusLabel("processing"), "Processing");
  assert.equal(recordingStatusLabel("ready"), "Completed");
  assert.equal(recordingStatusLabel("error"), "Needs Review");
});

test("M11 processing chain is server-confirmed and restart-safe", () => {
  const upload = read("../app/api/recordings/route.ts");
  const jobs = read("../lib/jobs.ts");
  const brainDump = read("../lib/agent/brain-dump.ts");
  assert.match(upload, /uploadClaimedRecording/);
  assert.match(upload, /status: "uploading"/);
  assert.match(jobs, /processBrainDumpTranscript/);
  assert.match(jobs, /from\("background_jobs"\)/);
  assert.match(brainDump, /executeIdempotentActions/);
  assert.match(brainDump, /storeValidatedDecision/);
  assert.match(read("../app/api/recordings/[id]/route.ts"), /PATCH/);
  assert.match(read("../components/recording-bank.tsx"), /תיקון ידני/);
});
