import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = readFileSync(
  new URL("../app/api/transcribe/route.ts", import.meta.url),
  "utf8",
);
const authSrc = readFileSync(
  new URL("../lib/server-auth.ts", import.meta.url),
  "utf8",
);

test("unauthenticated users cannot transcribe", () => {
  assert.match(src, /await authorize\(req\)/);
  assert.match(authSrc, /if \(!token\) throw new HttpError\(401/);
});

test("lean transcribe route stays a transcription endpoint only", () => {
  assert.doesNotMatch(
    src,
    /readState|budget|runRequestedActions|executeAction|loadMemory/,
  );
  assert.match(src, /audio\/transcriptions/);
  assert.match(src, /language", "he"/);
  assert.match(src, /transcriptionModelFromEnv/);
});
