import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { generateInstructionsSource } from "../scripts/bundle-instructions.mjs";
import { RUNTIME_CAPABILITIES } from "../lib/agent/capabilities.ts";
import { buildInstructions } from "../lib/agent/turn.ts";
import {
  recoverSafeReply,
  requestAgentDecision,
} from "../lib/agent/openai-orchestrator.ts";
import { inspectActions, parseDecision } from "../lib/action-schema.ts";
import { validateStoredPresentation } from "../lib/chat-presentation.ts";
import type { MemoryRow, TaskRow } from "../lib/types.ts";

const root = new URL("../", import.meta.url);
const uuid = "11111111-1111-4111-8111-111111111111";

function openAiEnvelope(text: string) {
  return {
    output: [{ content: [{ type: "output_text", text }] }],
  };
}

function responseFor(text: string) {
  return new Response(JSON.stringify(openAiEnvelope(text)), { status: 200 });
}

const validDecision = JSON.stringify({
  reply: "אפשר להתקדם.",
  actions: [],
  proposal: null,
  presentation: null,
  consequence_updates: [],
});

test("generated instruction bundle has no drift", () => {
  const markdown = readFileSync(
    new URL("lib/agent/INSTRUCTIONS.he.md", root),
    "utf8",
  );
  const bundled = readFileSync(
    new URL("lib/agent/instructions.ts", root),
    "utf8",
  );
  assert.equal(bundled, generateInstructionsSource(markdown));
});

test("runtime registry publishes only implemented Phase 1 capabilities", () => {
  assert.deepEqual(Object.keys(RUNTIME_CAPABILITIES), [
    "tasks",
    "memory",
    "presentations",
    "consequences",
    "schedule-save",
  ]);
});

test("preference memory and task can coexist in one turn", () => {
  const inspected = inspectActions([
    { type: "task.create", title: "לקנות חלב" },
    {
      type: "memory.upsert",
      kind: "preference",
      content: "מעדיף לעשות קניות בערב",
      confidence: "high",
      silent: true,
    },
  ]);
  assert.equal(inspected.results.length, 0);
  assert.deepEqual(
    inspected.accepted.map((action) => action.type),
    ["task.create", "memory.upsert"],
  );
});

test("memory correction keeps the existing id", () => {
  const inspected = inspectActions([
    {
      type: "memory.upsert",
      id: uuid,
      kind: "fact",
      content: "הילדה לא אוהבת זיתים",
      confidence: "high",
      silent: true,
    },
  ]);
  assert.equal(inspected.accepted[0]?.id, uuid);
});

test("temporary state is not required to become memory", () => {
  const instructions = readFileSync(
    new URL("lib/agent/INSTRUCTIONS.he.md", root),
    "utf8",
  );
  assert.match(instructions, /מצב רגעי אינו Memory/);
  assert.match(instructions, /לא צריך להפוך אוטומטית ל-Memory/);
  assert.doesNotMatch(
    readFileSync(new URL("lib/actions.ts", root), "utf8"),
    /classifier|auto.?memory|working.?memory/i,
  );
});

test("existing memory is included in future agent context", () => {
  const memory: MemoryRow = {
    id: uuid,
    kind: "preference",
    content: "מעדיף תשובות קצרות",
    confidence: "high",
    source: "agent",
    seen_at: null,
    created_at: "2026-09-12T00:00:00.000Z",
    updated_at: "2026-09-12T00:00:00.000Z",
  };
  const instructions = buildInstructions({ tasks: [], memory });
  assert.match(instructions, /מעדיף תשובות קצרות/);
});

test("malformed structured output gets exactly one retry", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return responseFor(
      calls === 1
        ? JSON.stringify({ reply: "אפשר להתקדם.", actions: "invalid" })
        : validDecision,
    );
  };
  const result = await requestAgentDecision({
    apiKey: "test",
    model: "test",
    instructions: "test",
    messages: [{ role: "user", content: "test" }],
    fetchImpl: fetchImpl as typeof fetch,
  });
  assert.equal(calls, 2);
  assert.equal(result.decision?.reply, "אפשר להתקדם.");
});

test("invalid actions never survive as a mutation decision", async () => {
  let calls = 0;
  const malformed = JSON.stringify({
    reply: "אפשר לענות בלי לבצע.",
    actions: [{ type: "task.create", title: "" }],
    presentation: { type: "unknown" },
  });
  const result = await requestAgentDecision({
    apiKey: "test",
    model: "test",
    instructions: "test",
    messages: [{ role: "user", content: "test" }],
    fetchImpl: (async () => {
      calls += 1;
      return responseFor(malformed);
    }) as typeof fetch,
  });
  assert.equal(calls, 2);
  assert.equal(result.decision, null);
  assert.equal(result.recoveredReply, "אפשר לענות בלי לבצע.");
});

test("unsafe execution claims are not recovered", () => {
  assert.equal(recoverSafeReply("שמרתי לך את המשימה."), null);
});

test("stored presentation metadata is closed and validated", () => {
  const valid = {
    type: "task_suggestions",
    items: [{ title: "לקנות חלב", reason: null }],
  };
  assert.deepEqual(validateStoredPresentation(valid), valid);
  assert.equal(
    validateStoredPresentation({ ...valid, unexpected: true }),
    null,
  );
});

test("proposal APIs and migration enforce ownership and expiry", () => {
  const migration = readFileSync(
    new URL(
      "database/migrations/20260912_lean_agent_foundation.sql",
      root,
    ),
    "utf8",
  );
  assert.match(migration, /agent_proposals/);
  assert.match(migration, /expires_at timestamptz not null/);
  assert.match(migration, /auth\.uid\(\)\) = user_id/);
  const proposalService = readFileSync(
    new URL("lib/proposals.ts", root),
    "utf8",
  );
  assert.match(proposalService, /\.eq\("user_id", userId\)/);
  assert.match(proposalService, /status: "expired"/);
  for (const action of ["approve", "reject", "revise"]) {
    const route = readFileSync(
      new URL(`app/api/proposals/${action}/route.ts`, root),
      "utf8",
    );
    assert.match(route, /authorize\(req\)/);
  }
});

test("only the agent's explicit proposal creates an approval boundary", () => {
  const proposal = parseDecision(
    JSON.stringify({
      reply: "יש שינוי שכדאי לאשר.",
      actions: [],
      proposal: {
        summary: "עדכון המשימה",
        actions: [{ type: "task.update", id: uuid, title: "שם חדש" }],
        expires_in_seconds: 900,
      },
      presentation: null,
      consequence_updates: [],
    }),
  );
  assert.equal(proposal.ok, true);
  if (proposal.ok) {
    assert.equal(proposal.actions.length, 0);
    assert.equal(proposal.proposal?.actions[0]?.type, "task.update");
  }

  const direct = parseDecision(
    JSON.stringify({
      reply: "אבצע.",
      actions: Array.from({ length: 5 }, (_, index) => ({
        type: "task.create",
        title: `משימה ${index}`,
      })),
      proposal: null,
      presentation: null,
      consequence_updates: [],
    }),
  );
  assert.equal(direct.ok, true);
  if (direct.ok) assert.equal(direct.actions.length, 5);
});

test("turn receipt and client key prevent duplicate execution on retry", () => {
  const receipt = readFileSync(
    new URL("lib/agent/turn-receipts.ts", root),
    "utf8",
  );
  const client = readFileSync(
    new URL("components/chat-app.tsx", root),
    "utf8",
  );
  const migration = readFileSync(
    new URL(
      "database/migrations/20260912_lean_agent_foundation.sql",
      root,
    ),
    "utf8",
  );
  assert.match(receipt, /23505/);
  assert.match(migration, /unique \(user_id, turn_key\)/);
  assert.match(client, /turn_id: turnId/);
  assert.match(client, /crypto\.randomUUID/);
});

test("no prohibited routing or legacy state was added", () => {
  const files = [
    "lib/agent/capabilities.ts",
    "lib/agent/openai-orchestrator.ts",
    "lib/proposals.ts",
  ];
  for (const file of files) {
    const source = readFileSync(new URL(file, root), "utf8");
    assert.doesNotMatch(source, /app_states|keyword router|ranking engine/i);
  }
});
