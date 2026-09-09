import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyState } from "../lib/model";
import { applyActions } from "../lib/engine";
import { orchestrateChatTurn } from "../lib/agent/orchestration";
import { parseAgentDecisionIsolated } from "../lib/agent/schema";
import { buildAgentContext } from "../lib/domain/agent-context";
import { buildAgentRuntimeContext } from "../lib/agent/runtime-context";
import { executeDeepAccess } from "../lib/agent/deep-access";
import { retrieveTasks } from "../lib/agent/task-retrieval";
import {
  sanitizePresentation,
  mergePresentedEntityIds,
} from "../lib/domain/agent-presentation";
import { analyzeFirstScanWithAgent } from "../lib/domain/first-scan/ai";
import {
  chunkScanText,
  scanChunksCoverInput,
} from "../lib/domain/first-scan/chunks";
import { parseSemanticScanResult } from "../lib/domain/first-scan/semantic";
import { buildScanApproveActions } from "../lib/domain/first-scan/approve";
import type { AgentDecision } from "../lib/agent/schema";

const NOW = new Date("2026-09-09T10:00:00Z");
const OLD_ID = "aaaaaaaa-aaaa-4aaa-8aaa-000000000000";
const FOCUS_ID = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";
const INVALID_ID = "cccccccc-cccc-4ccc-8ccc-000000000002";

function consentState() {
  const s = emptyState();
  return { ...s, profile: { ...s.profile, aiConsent: true } };
}

function decision(
  partial: Partial<AgentDecision> & Pick<AgentDecision, "reply">,
): AgentDecision {
  return {
    explicitActions: [],
    clarification: null,
    proposal: null,
    affectsToday: false,
    initiative: "user_requested",
    deepAccessRequests: [],
    workingMemoryUpdate: null,
    presentation: null,
    scanDraft: null,
    ...partial,
  };
}

test("Focus click routes to Personal Agent and renders valid presentation IDs", async () => {
  let state = consentState();
  state = applyActions(
    state,
    [{ type: "task.create", task: { id: FOCUS_ID, title: "לבדוק ביטוח" } }],
    NOW,
    true,
  );
  const result = await orchestrateChatTurn({
    state,
    revision: 1,
    message: "מה שכחתי?",
    contextTaskId: null,
    turnId: "11111111-1111-4111-8111-111111111111",
    requestId: "22222222-2222-4222-8222-222222222222",
    surface: "focus",
    modelCall: async () => ({
      decision: decision({
        reply: "כדאי להציף את הביטוח.",
        presentation: { taskIds: [FOCUS_ID, INVALID_ID] },
      }),
      model: "injected",
      rejectedActions: [],
    }),
  });
  assert.deepEqual(result.presentation.taskIds, [FOCUS_ID]);
  assert.ok(!result.presentation.taskIds.includes(INVALID_ID));
  const shown = sanitizePresentation(state, result.presentation);
  assert.deepEqual(shown.taskIds, [FOCUS_ID]);
});

test("invalid presentation IDs are ignored mechanically", () => {
  const state = consentState();
  const shown = sanitizePresentation(state, {
    taskIds: [INVALID_ID, "not-an-id"],
  });
  assert.deepEqual(shown.taskIds, []);
});

test("Free Time context carries availableMinutes and effort; effort changes input", () => {
  const state = consentState();
  const a = buildAgentContext(state, {
    now: NOW,
    surface: "free_time",
    surfaceContext: { availableMinutes: 20, effort: 1 },
  });
  const b = buildAgentContext(state, {
    now: NOW,
    surface: "free_time",
    surfaceContext: { availableMinutes: 20, effort: 3 },
  });
  assert.equal(a.surface, "free_time");
  assert.equal(a.surfaceContext?.availableMinutes, 20);
  assert.equal(a.surfaceContext?.effort, 1);
  assert.equal(b.surfaceContext?.effort, 3);
  assert.notEqual(a.surfaceContext?.effort, b.surfaceContext?.effort);
});

test("First Scan preserves agent timing through parse and approve", () => {
  const analysis = parseSemanticScanResult({
    detectedAreas: [],
    observations: [],
    proposedTasks: [
      {
        title: "לתת אוכל לכלב כל יום",
        categoryId: "pets",
        detailTypeId: null,
        homeAreaNames: [],
        dependsOnTitles: [],
        relatedMemberNames: [],
        recurrenceDays: 1,
        dueAt: "2026-09-20",
        deadline: {
          date: "2026-09-20",
          time: null,
          timezone: "Asia/Jerusalem",
          precision: "date",
        },
      },
    ],
    profileFacts: [],
    clarification: null,
    inventedRoutine: false,
    inventedDeadline: false,
    inventedResponsibility: false,
    inventedDuration: false,
  });
  assert.equal(analysis.proposedTasks[0]?.recurrenceDays, 1);
  assert.equal(analysis.proposedTasks[0]?.dueAt, null);
  assert.equal(analysis.proposedTasks[0]?.deadline?.precision, "date");
  assert.equal(analysis.proposedTasks[0]?.deadline?.time, null);

  const sessionId = "dddddddd-dddd-4ddd-8ddd-000000000001";
  const proposalId = "dddddddd-dddd-4ddd-8ddd-000000000002";
  let state = consentState();
  state = applyActions(
    state,
    [
      {
        type: "scan.set",
        firstScan: {
          status: "in_progress",
          session: {
            id: sessionId,
            status: "review",
            chunks: [],
            draftAnalysis: analysis,
            proposalId: null,
            createdAt: NOW.toISOString(),
            updatedAt: NOW.toISOString(),
          },
        },
      },
    ],
    NOW,
    true,
  );
  const approved = buildScanApproveActions(state, analysis, {
    scanSessionId: sessionId,
    proposalId,
  });
  const created = approved.actions.find((a) => a.type === "task.create");
  assert.equal(created?.type, "task.create");
  if (created?.type === "task.create") {
    assert.equal(created.task.recurrenceDays, 1);
    assert.equal(created.task.dueAt, null);
    assert.equal(created.task.deadline?.precision, "date");
    assert.equal(created.task.deadline?.time, null);
  }
});

test("long First Scan input covers beginning and end with no silent 8000 slice", async () => {
  const ai = readFileSync(
    join(process.cwd(), "lib/domain/first-scan/ai.ts"),
    "utf8",
  );
  const route = readFileSync(
    join(process.cwd(), "app/api/first-scan/analyze/route.ts"),
    "utf8",
  );
  assert.doesNotMatch(ai, /slice\(0,\s*8000\)/);
  assert.doesNotMatch(route, /slice\(0,\s*8000\)/);

  const head = "UNIQUE_HEAD_TOKEN_ALPHA ";
  const tail = " UNIQUE_TAIL_TOKEN_OMEGA";
  const text = `${head}${"מידע אמצע. ".repeat(2500)}${tail}`;
  assert.ok(text.length >= 20_000);
  const chunks = chunkScanText(text);
  assert.ok(scanChunksCoverInput(text, chunks));
  assert.ok(chunks.some((c) => c.text.includes("UNIQUE_HEAD_TOKEN_ALPHA")));
  assert.ok(chunks.some((c) => c.text.includes("UNIQUE_TAIL_TOKEN_OMEGA")));

  const seen: string[] = [];
  const result = await analyzeFirstScanWithAgent({
    text,
    state: consentState(),
    revision: 1,
    modelCall: async (_model, _instructions, input) => {
      const payload = JSON.stringify(input);
      seen.push(payload);
      return {
        decision: decision({
          reply: "סקירה",
          scanDraft: {
            detectedAreas: [],
            observations: [],
            proposedTasks: [],
            profileFacts: [],
            clarification: null,
            inventedRoutine: false,
            inventedDeadline: false,
            inventedResponsibility: false,
            inventedDuration: false,
          },
        }),
        model: "injected",
        rejectedActions: [],
      };
    },
  });
  assert.equal(result.source, "agent");
  assert.ok(seen.some((row) => row.includes("UNIQUE_HEAD_TOKEN_ALPHA")));
  assert.ok(seen.some((row) => row.includes("UNIQUE_TAIL_TOKEN_OMEGA")));
});

test("First Scan can reuse typed agent actions when scanDraft is omitted", async () => {
  const result = await analyzeFirstScanWithAgent({
    text: "יש מטבח. כל יום לרוקן מדיח. ארנונה עד 2026-09-20.",
    state: consentState(),
    revision: 1,
    modelCall: async () => ({
      decision: decision({
        reply: "זיהיתי משימות מהסקירה.",
        proposal: {
          summary: "יש משימות חדשות",
          reason: "new_tasks",
          proposedActions: [
            {
              type: "task.create",
              task: {
                title: "לרוקן מדיח",
                categoryId: "kitchen_dishes",
                recurrenceDays: 1,
                deadline: {
                  date: "2026-09-20",
                  time: null,
                  timezone: "Asia/Jerusalem",
                  precision: "date",
                },
              },
            },
          ],
        },
      }),
      model: "injected",
      rejectedActions: [],
    }),
  });
  assert.equal(result.analysis.proposedTasks[0]?.recurrenceDays, 1);
  assert.equal(result.analysis.proposedTasks[0]?.deadline?.precision, "date");
  assert.equal(result.analysis.proposedTasks[0]?.dueAt, null);
});

test("First Scan production path does not fall back to the heuristic parser", () => {
  const ai = readFileSync(
    join(process.cwd(), "lib/domain/first-scan/ai.ts"),
    "utf8",
  );
  const route = readFileSync(
    join(process.cwd(), "app/api/first-scan/analyze/route.ts"),
    "utf8",
  );
  assert.doesNotMatch(ai, /analyzeScanText/);
  assert.doesNotMatch(route, /analyzeScanText/);
});

test("350 active tasks remain reachable via list/search and entity open", () => {
  let state = consentState();
  for (let start = 0; start < 350; start += 50) {
    const batch = Array.from(
      { length: Math.min(50, 350 - start) },
      (_, offset) => {
        const i = start + offset;
        return {
          type: "task.create" as const,
          task: {
            id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`,
            title: i === 0 ? "משימה ישנה ייחודית לקריאה" : `משימה פעילה ${i}`,
          },
        };
      },
    );
    state = applyActions(state, batch, NOW, true);
  }
  const ctx = buildAgentContext(state, { now: NOW, surface: "chat" });
  assert.ok(!ctx.tasks.some((t) => t.id === OLD_ID));
  assert.ok(ctx.tasks.length <= 100);

  const page1 = retrieveTasks(state, {
    status: ["open", "unknown", "in_progress"],
    limit: 100,
    compact: true,
  });
  assert.equal(page1.items.length, 100);
  assert.equal(page1.hasMore, true);
  assert.ok(page1.nextCursor);

  const page2 = retrieveTasks(state, {
    status: ["open", "unknown", "in_progress"],
    limit: 100,
    compact: true,
    cursor: page1.nextCursor ?? undefined,
  });
  assert.ok(page2.items.length > 0);
  assert.notEqual(page2.items[0]?.id, page1.items[0]?.id);

  const found = executeDeepAccess(state, {
    tool: "state.search_tasks",
    query: { text: "משימה ישנה ייחודית לקריאה", limit: 10, compact: true },
  });
  assert.equal(found.ok, true);
  const ids = (found.data as { items: { id: string }[] }).items.map(
    (x) => x.id,
  );
  assert.ok(ids.includes(OLD_ID));

  const opened = executeDeepAccess(state, {
    tool: "state.get_entity",
    entityId: OLD_ID,
  });
  assert.equal(opened.ok, true);
  assert.equal(
    (opened.data as { entity?: { id: string } })?.entity?.id,
    OLD_ID,
  );
});

test("Working Memory can keep Focus/Free Time presentation references", () => {
  let state = consentState();
  state = applyActions(
    state,
    [{ type: "task.create", task: { id: FOCUS_ID, title: "סידור מדפים" } }],
    NOW,
    true,
  );
  const presented = sanitizePresentation(state, { taskIds: [FOCUS_ID] });
  const merged = mergePresentedEntityIds([], presented.taskIds);
  state = applyActions(
    state,
    [{ type: "workingMemory.patch", patch: { relevantEntityIds: merged } }],
    NOW,
    true,
  );
  const runtime = buildAgentRuntimeContext({
    state,
    stateRevision: 1,
    householdId: "local",
    turnId: "11111111-1111-4111-8111-111111111111",
    requestId: "22222222-2222-4222-8222-222222222222",
    now: NOW,
  });
  assert.ok(runtime.workingMemory?.relevantEntityIds.includes(FOCUS_ID));
  assert.ok(runtime.references.referencedEntityIds.includes(FOCUS_ID));
});

test("presentation parse is generic and not feature-specific", () => {
  const isolated = parseAgentDecisionIsolated({
    reply: "הנה כמה משימות.",
    explicitActions: [],
    clarification: null,
    proposal: null,
    affectsToday: false,
    presentation: { taskIds: [FOCUS_ID] },
  });
  assert.deepEqual(isolated.decision.presentation?.taskIds, [FOCUS_ID]);
});
