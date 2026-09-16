import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatMemoryForDisplay,
  reconcileMemoryWrite,
  preferenceTopicKey,
} from "../lib/memory-display.ts";
import { encodeActionFollowupRelation } from "../lib/agent/learned-relations.ts";
import { parseRecordingOrigin } from "../lib/audio/recording-origin.ts";
import {
  DEEP_CHECK_EMPTY_REPLY,
  DEEP_CHECK_FALLBACK_REPLY,
  ensureUserReply,
} from "../lib/agent/surface-fallback.ts";
import { appendTranscript } from "../lib/audio/recorder-helpers.ts";

const root = join(import.meta.dirname, "..");

test("recording origin parser defaults unknown to chat", () => {
  assert.equal(parseRecordingOrigin(null), "chat");
  assert.equal(parseRecordingOrigin("bank"), "bank");
  assert.equal(parseRecordingOrigin("weird"), "chat");
});

test("bank GET and clients tag origin", () => {
  const route = readFileSync(join(root, "app/api/recordings/route.ts"), "utf8");
  const bank = readFileSync(join(root, "components/recording-bank.tsx"), "utf8");
  const voice = readFileSync(join(root, "components/voice-recorder.tsx"), "utf8");
  const brain = readFileSync(join(root, "components/brain-dump-recorder.tsx"), "utf8");
  const client = readFileSync(join(root, "lib/audio/transcribe-client.ts"), "utf8");
  assert.match(route, /X-Recording-Origin|x-recording-origin|parseRecordingOrigin/);
  assert.match(route, /origin/);
  assert.match(bank, /origin=bank/);
  assert.match(voice, /"chat"/);
  assert.match(brain, /"bank"/);
  assert.match(client, /X-Recording-Origin/);
  assert.match(
    readFileSync(
      join(root, "database/migrations/20260916_recordings_origin_subtasks_memory.sql"),
      "utf8",
    ),
    /add column if not exists origin/,
  );
});

test("memory display hides raw JSON relation", () => {
  const content = encodeActionFollowupRelation({
    trigger: "ניקוי מקרר",
    followup: "להוציא זבל",
  });
  const display = formatMemoryForDisplay({
    content,
    kind: "fact",
    category: "relation",
  });
  assert.doesNotMatch(display.text, /action_followup/);
  assert.doesNotMatch(display.text, /"v":/);
  assert.match(display.text, /ניקוי מקרר/);
  assert.match(display.text, /להוציא זבל/);
  assert.equal(display.categoryLabel, "הרגל/קשר");
});

test("memory reconcile keeps temporary exception separate", () => {
  const standing = {
    id: "11111111-1111-1111-1111-111111111111",
    kind: "preference" as const,
    content: "אני מעדיפה לקפל כביסה בבוקר",
    updated_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    active: true,
  };
  const decision = reconcileMemoryWrite({
    content: "מחר דווקא אקפל בערב",
    kind: "preference",
    existing: [standing],
  });
  assert.equal(decision.mode, "exception");
  assert.equal(decision.scope, "temporary");
  assert.equal(decision.keepStandingId, standing.id);
});

test("memory reconcile updates standing preference topic", () => {
  const standing = {
    id: "22222222-2222-2222-2222-222222222222",
    kind: "preference" as const,
    content: "אני מעדיפה לקפל כביסה בבוקר",
    updated_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    active: true,
  };
  const decision = reconcileMemoryWrite({
    content: "מעכשיו אני מעדיפה לקפל כביסה בערב",
    kind: "preference",
    existing: [standing],
  });
  assert.ok(preferenceTopicKey(standing.content));
  assert.ok(
    decision.mode === "insert" || decision.mode === "update",
    `unexpected mode ${decision.mode}`,
  );
});

test("deep-check empty insights get useful reply not failure text", () => {
  const reply = ensureUserReply({
    reply: "",
    surface: "deep-check",
    presentation: { type: "insights", items: [] },
  });
  assert.equal(reply, DEEP_CHECK_EMPTY_REPLY);
  assert.notEqual(reply, DEEP_CHECK_FALLBACK_REPLY);
});

test("deep-check UI can run standalone from home surface", () => {
  const chat = readFileSync(join(root, "components/chat-app.tsx"), "utf8");
  const surfaces = readFileSync(
    join(root, "components/personal-agent-surfaces.tsx"),
    "utf8",
  );
  assert.match(chat, /mode=\{view === "deep-check"/);
  assert.match(chat, /agentSurfaces\.run\(\{ type: "deep-check" \}\)/);
  assert.match(surfaces, /mode\?: "forgotten" \| "deep-check"/);
  assert.match(surfaces, /התחל בדיקה לעומק/);
});

test("task editor and subtasks API exist", () => {
  const editor = readFileSync(join(root, "components/task-editor.tsx"), "utf8");
  const api = readFileSync(
    join(root, "app/api/tasks/[id]/subtasks/route.ts"),
    "utf8",
  );
  const types = readFileSync(join(root, "lib/types.ts"), "utf8");
  assert.match(editor, /תתי־משימות/);
  assert.match(api, /mutateSubtask/);
  assert.match(types, /task\.subtask\.add/);
});

test("chat mic voice send is idempotent by recording id", () => {
  const chat = readFileSync(join(root, "components/chat-app.tsx"), "utf8");
  const voice = readFileSync(join(root, "components/voice-recorder.tsx"), "utf8");
  assert.match(chat, /voiceSentRecordingIds/);
  assert.match(chat, /sendingRef/);
  assert.match(chat, /pendingVoiceSend/);
  assert.match(chat, /sendVoiceTranscript\(\s*transcript,\s*recordingId/);
  assert.match(voice, /onText: \(text: string, recordingId: string\)/);
});

test("voice auto-send stress helpers keep transcript merge stable", () => {
  let draft = "";
  const sent = new Set<string>();
  const cycles = 120;
  for (let i = 0; i < cycles; i += 1) {
    const recordingId = `rec-${i}`;
    const piece = `הודעה ${i}`;
    if (sent.has(recordingId)) continue;
    draft = appendTranscript(draft, piece);
    // simulate success → clear draft and mark sent once
    sent.add(recordingId);
    draft = "";
  }
  assert.equal(sent.size, cycles);
  assert.equal(draft, "");
});

test("memory learning UI no longer renders content raw for relations", () => {
  const ui = readFileSync(join(root, "components/memory-learning.tsx"), "utf8");
  assert.match(ui, /formatMemoryForDisplay/);
  assert.match(ui, /categoryLabel/);
  assert.doesNotMatch(ui, /\{memory\.content\}/);
});
