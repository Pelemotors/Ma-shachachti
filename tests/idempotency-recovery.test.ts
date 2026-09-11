import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { executeIdempotentActions } from "../lib/agent/idempotent-actions.ts";
import {
  parseStoredDecision,
  storeValidatedDecision,
} from "../lib/agent/stored-decision.ts";
import { approveProposal } from "../lib/proposals.ts";
import { persistTurnMessage } from "../lib/chat-sessions.ts";
import type { AgentAction } from "../lib/types.ts";
import { parseDecision } from "../lib/action-schema.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const turnId = "22222222-2222-4222-8222-222222222222";
const proposalId = "33333333-3333-4333-8333-333333333333";
const sessionId = "44444444-4444-4444-8444-444444444444";

function action(partial: Partial<AgentAction>): AgentAction {
  return {
    type: "memory.upsert",
    id: null,
    title: null,
    notes: null,
    due_on: null,
    due_time: null,
    due_patch: null,
    reminder_enabled: null,
    reminder_offset_minutes: null,
    reminder_patch: null,
    plan_patch: null,
    planned_date: null,
    planned_start_time: null,
    planned_end_time: null,
    kind: "preference",
    content: "מעדיף תשובות קצרות",
    confidence: "high",
    silent: true,
    ...partial,
  };
}

function atomicRpcDb() {
  const receipts = new Map<string, Promise<Record<string, unknown>>>();
  let mutations = 0;
  const db = {
    rpc(_name: string, args: Record<string, unknown>) {
      const key = `${args.p_scope}:${args.p_scope_id}:${args.p_action_index}`;
      let receipt = receipts.get(key);
      if (!receipt) {
        const requested = args.p_action as AgentAction;
        receipt = new Promise((resolve) => {
          setTimeout(() => {
            mutations += 1;
            resolve({
              ok: true,
              type: requested.type,
              id: "55555555-5555-4555-8555-555555555555",
              silent: requested.silent === true,
            });
          }, 2);
        });
        receipts.set(key, receipt);
      }
      return receipt.then((data) => ({ data, error: null }));
    },
  };
  return { db: db as never, mutations: () => mutations };
}

test("failure after an action then turn retry never repeats the mutation", async () => {
  const fake = atomicRpcDb();
  const actions = [action({})];
  const first = await executeIdempotentActions(fake.db, {
    scope: "turn",
    scopeId: turnId,
    actions,
  });
  assert.equal(first[0]?.ok, true);
  assert.equal(fake.mutations(), 1);

  // Simulate assistant-message/turn completion failure after the action.
  const retried = await executeIdempotentActions(fake.db, {
    scope: "turn",
    scopeId: turnId,
    actions,
  });
  assert.deepEqual(retried, first);
  assert.equal(fake.mutations(), 1);
});

test("validated decision is persisted and reused without another LLM choice", () => {
  const parsed = parseDecision(
    JSON.stringify({
      reply: "אבצע.",
      actions: [action({})],
      proposal: null,
      presentation: null,
      consequence_updates: [],
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const stored = storeValidatedDecision({
    decision: parsed,
    recoveredReply: null,
    attempts: 1,
  });
  const resumed = parseStoredDecision(stored);
  assert.deepEqual(resumed?.decision?.actions, parsed.actions);
  assert.equal(resumed?.decision?.reply, parsed.reply);
});

test("concurrent proposal action execution shares one atomic receipt", async () => {
  const fake = atomicRpcDb();
  const actions = [action({ type: "task.create", title: "לקנות חלב" })];
  const [left, right] = await Promise.all([
    executeIdempotentActions(fake.db, {
      scope: "proposal",
      scopeId: proposalId,
      actions,
    }),
    executeIdempotentActions(fake.db, {
      scope: "proposal",
      scopeId: proposalId,
      actions,
    }),
  ]);
  assert.deepEqual(left, right);
  assert.equal(fake.mutations(), 1);
});

function proposalDb(options: { failFinalSaveOnce?: boolean } = {}) {
  const proposal = {
    id: proposalId,
    user_id: userId,
    session_id: sessionId,
    turn_id: turnId,
    summary: "שמירת העדפה",
    actions: [action({})],
    status: "pending",
    revision: 1,
    action_results: null as unknown[] | null,
    expires_at: "2099-01-01T00:00:00.000Z",
  };
  const receipts = new Map<string, Promise<Record<string, unknown>>>();
  let mutationCount = 0;
  let failFinalSaveOnce = options.failFinalSaveOnce === true;

  function from() {
    let operation: "select" | "update" = "select";
    let patch: Record<string, unknown> | null = null;
    const filters = new Map<string, unknown>();
    const execute = () => {
      if (
        [...filters].some(
          ([key, value]) =>
            (proposal as unknown as Record<string, unknown>)[key] !== value,
        )
      ) {
        return { data: null, error: null };
      }
      if (operation === "update" && patch) {
        if (patch.status === "approved" && failFinalSaveOnce) {
          failFinalSaveOnce = false;
          return { data: null, error: { message: "save failed" } };
        }
        Object.assign(proposal, patch);
      }
      return { data: { ...proposal }, error: null };
    };
    const builder = {
      select() {
        return builder;
      },
      update(value: Record<string, unknown>) {
        operation = "update";
        patch = value;
        return builder;
      },
      eq(key: string, value: unknown) {
        filters.set(key, value);
        return builder;
      },
      maybeSingle: async () => execute(),
      then(
        resolve: (value: ReturnType<typeof execute>) => unknown,
        reject?: (reason: unknown) => unknown,
      ) {
        return Promise.resolve(execute()).then(resolve, reject);
      },
    };
    return builder;
  }

  const db = {
    from,
    rpc(_name: string, args: Record<string, unknown>) {
      const key = `${args.p_scope}:${args.p_scope_id}:${args.p_action_index}`;
      let receipt = receipts.get(key);
      if (!receipt) {
        receipt = new Promise((resolve) => {
          setTimeout(() => {
            mutationCount += 1;
            resolve({
              ok: true,
              type: "memory.upsert",
              id: "55555555-5555-4555-8555-555555555555",
              silent: true,
            });
          }, 2);
        });
        receipts.set(key, receipt);
      }
      return receipt.then((data) => ({ data, error: null }));
    },
  };
  return {
    db: db as never,
    proposal,
    mutationCount: () => mutationCount,
  };
}

test("approve resumes from executing after result-save failure", async () => {
  const fake = proposalDb({ failFinalSaveOnce: true });
  await assert.rejects(() => approveProposal(fake.db, userId, proposalId));
  assert.equal(fake.proposal.status, "executing");
  assert.equal(fake.mutationCount(), 1);

  const retried = await approveProposal(fake.db, userId, proposalId);
  assert.equal(retried.ok, true);
  assert.equal(fake.proposal.status, "approved");
  assert.equal(fake.mutationCount(), 1);
  assert.equal(fake.proposal.action_results?.length, 1);
  const repeated = await approveProposal(fake.db, userId, proposalId);
  assert.equal(repeated.ok, true);
  if (repeated.ok) assert.equal(repeated.alreadyExecuted, true);
  assert.equal(fake.mutationCount(), 1);
});

test("concurrent approve calls execute every proposal action once", async () => {
  const fake = proposalDb();
  const [left, right] = await Promise.all([
    approveProposal(fake.db, userId, proposalId),
    approveProposal(fake.db, userId, proposalId),
  ]);
  assert.equal(left.ok, true);
  assert.equal(right.ok, true);
  assert.equal(fake.proposal.status, "approved");
  assert.equal(fake.mutationCount(), 1);
});

function messageDb() {
  const rows: Array<Record<string, unknown>> = [];
  function from() {
    let inserted: Record<string, unknown> | null = null;
    const filters = new Map<string, unknown>();
    const builder = {
      insert(value: Record<string, unknown>) {
        inserted = value;
        return builder;
      },
      select() {
        return builder;
      },
      eq(key: string, value: unknown) {
        filters.set(key, value);
        return builder;
      },
      async single() {
        const duplicate = rows.find(
          (row) =>
            row.user_id === inserted?.user_id &&
            row.turn_id === inserted?.turn_id &&
            row.role === inserted?.role,
        );
        if (duplicate) return { data: null, error: { code: "23505" } };
        const saved = {
          ...inserted,
          id: `${rows.length + 1}`,
          created_at: "2026-09-12T00:00:00.000Z",
        };
        rows.push(saved);
        return { data: saved, error: null };
      },
      async maybeSingle() {
        const row = rows.find((candidate) =>
          [...filters].every(([key, value]) => candidate[key] === value),
        );
        return { data: row ?? null, error: null };
      },
    };
    return builder;
  }
  return { db: { from } as never, rows };
}

test("turn-associated user and assistant messages are stable on retry", async () => {
  const fake = messageDb();
  const input = {
    userId,
    sessionId,
    turnId,
    role: "user" as const,
    content: "שלום",
  };
  const first = await persistTurnMessage(fake.db, input);
  const second = await persistTurnMessage(fake.db, input);
  assert.equal(first.id, second.id);
  const assistant = {
    ...input,
    role: "assistant" as const,
    content: "שלום גם לך",
  };
  const firstAssistant = await persistTurnMessage(fake.db, assistant);
  const secondAssistant = await persistTurnMessage(fake.db, assistant);
  assert.equal(firstAssistant.id, secondAssistant.id);
  assert.equal(fake.rows.length, 2);
});

test("proposal is rendered with approve and reject controls", () => {
  const source = readFileSync(
    new URL("../components/chat-app.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /message\.proposal\.summary/);
  assert.match(source, /אשר ובצע/);
  assert.match(source, /\/api\/proposals\/\$\{action\}/);
  assert.match(source, />\s*דחה\s*</);
});
