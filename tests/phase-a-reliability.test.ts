import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  classifyAgentError,
  AGENT_FAILURE_CATEGORIES,
} from "../lib/agent/failure.ts";
import {
  DEEP_CHECK_FALLBACK_REPLY,
  ensureUserReply,
  surfaceFallbackReply,
} from "../lib/agent/surface-fallback.ts";
import {
  AGENT_ATTEMPT_TIMEOUT_MS,
  AGENT_TOTAL_DEADLINE_MS,
  recoverSafeReply,
} from "../lib/agent/openai-orchestrator.ts";
import { buildCompactContext } from "../lib/agent/context/compact.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

test("failure taxonomy covers required categories", () => {
  for (const key of [
    "timeout",
    "transport",
    "empty_output",
    "invalid_json",
    "schema_violation",
    "invalid_insights",
    "persistence_failure",
    "unknown",
  ]) {
    assert.ok((AGENT_FAILURE_CATEGORIES as readonly string[]).includes(key));
  }
  assert.equal(classifyAgentError(new DOMException("aborted", "AbortError")), "timeout");
  assert.equal(classifyAgentError(new Error("timeout")), "timeout");
  assert.equal(classifyAgentError(new Error("invalid_output")), "schema_violation");
});

test("deep-check empty reply becomes fallback not empty", () => {
  assert.equal(
    ensureUserReply({
      reply: "",
      surface: "deep-check",
      presentation: null,
    }),
    DEEP_CHECK_FALLBACK_REPLY,
  );
  assert.match(surfaceFallbackReply("deep-check", null), /בדיקה העמוקה|לנסות שוב/);
});

test("orchestrator uses total deadline smaller than two full 30s waits", () => {
  assert.ok(AGENT_ATTEMPT_TIMEOUT_MS < 30_000);
  assert.ok(AGENT_TOTAL_DEADLINE_MS < 60_000);
  assert.ok(AGENT_TOTAL_DEADLINE_MS > AGENT_ATTEMPT_TIMEOUT_MS);
  const source = read("lib/agent/openai-orchestrator.ts");
  assert.match(source, /deadlineAt/);
  assert.match(source, /remainingTimeoutMs/);
});

test("chat route ensures reply and soft-fails deep-check", () => {
  const route = read("app/api/chat/route.ts");
  assert.match(route, /ensureUserReply/);
  assert.match(route, /DEEP_CHECK_FALLBACK_REPLY/);
  assert.match(route, /deep_check_fallback|partial: true/);
  assert.match(route, /logAgentFailure/);
  assert.doesNotMatch(
    route,
    /if \(!reply\) throw new HttpError\(502, "הסוכן לא החזיר תשובה\."\);\n\n    const saved/,
  );
});

test("brain-dump compact includes shopping and tasks", () => {
  const ctx = buildCompactContext({
    surface: null,
    surfaceContext: null,
    profile: null,
    currentTime: "13:40",
    queryHint: "לקנות חלב",
    allTasks: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        title: "משימה ישנה",
        notes: "",
        status: "open",
        due_on: null,
        due_at: null,
        reminder_at: null,
        reminder_offset_minutes: null,
        reminder_enabled: false,
        reminder_sent_at: null,
        reminder_claimed_at: null,
        planned_start_at: null,
        planned_end_at: null,
        reschedule_count: 0,
        last_rescheduled_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        completed_at: null,
      },
    ],
    allMemory: [],
    consequences: [],
    shopping: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        title: "לחם",
        quantity: 1,
        purchased_at: null,
        order_index: 0,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    checklists: [],
    purpose: "brain-dump",
  });
  assert.ok(ctx.modules.includes("brain-dump"));
  assert.equal(ctx.tasks.length, 1);
  assert.equal(ctx.shopping.length, 1);
});

test("brain-dump soft-fails upstream without throwing when possible", () => {
  const source = read("lib/agent/brain-dump.ts");
  assert.match(source, /stage: BrainDumpStage/);
  assert.match(source, /failure_category/);
  assert.match(source, /AgentUpstreamError/);
  assert.match(source, /התמלול נשמר/);
  assert.match(source, /purpose: "brain-dump"/);
});

test("chat voice auto-sends transcript once with draft preserve on failure", () => {
  const chat = read("components/chat-app.tsx");
  assert.match(chat, /sendVoiceTranscript/);
  assert.match(chat, /voiceSendLock/);
  assert.match(chat, /voiceSentRecordingIds/);
  assert.match(chat, /sendingRef/);
  assert.match(chat, /void sendVoiceTranscript\(transcript, recordingId\)/);
});

test("recoverSafeReply still rejects execution claims", () => {
  assert.equal(recoverSafeReply('{"reply":"הוספתי משימה"}'), null);
  assert.equal(recoverSafeReply('{"reply":"מה נשמע?"}'), "מה נשמע?");
});
