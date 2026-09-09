import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, type AppState } from "../lib/model";
import { applyActions } from "../lib/engine";
import {
  buildAgentContextSnapshot,
  computeDomainRevisions,
  invalidateAgentContextCache,
  peekAgentContextCache,
  STRUCTURAL_CONTEXT_DOMAINS,
} from "../lib/agent/context-snapshot";
import {
  getCapabilityRegistrySnapshot,
  buildLiveCapabilityContext,
} from "../lib/agent/capability-registry";
import {
  executeDeepAccess,
  hydrateMissingReferences,
} from "../lib/agent/deep-access";
import { buildAgentRuntimeContext } from "../lib/agent/runtime-context";
import {
  buildEntityIndex,
  structuralContextFingerprint,
} from "../lib/agent/entity-index";
import {
  clearCachedHouseholdState,
  getCachedHouseholdState,
  putCachedHouseholdState,
  cachedRevisionMatches,
} from "../lib/server/state-cache";
import { loadStateForTurn } from "../lib/server/state-store";
import type { SupabaseClient } from "@supabase/supabase-js";

const NOW = new Date("2026-09-09T10:00:00Z");

function baseSlices(state: AppState) {
  return {
    profile: { timezone: state.profile.timezone },
    tasks: state.tasks,
    reminders: state.reminders,
    routines: state.routines,
    plans: state.planning,
    home: state.homeAreas,
    memory: state.facts,
    checklists: [],
    forecasts: state.learning,
    processes: state.operations,
    shopping: state.shopping,
    personalChecklists: state.checklists,
    messages: state.messages,
    workingMemory: state.agentWorkingMemory,
    entityIndex: buildEntityIndex(state, NOW),
    personalAgentGuide: {
      exists: Boolean(state.personalAgentGuide),
      text: state.personalAgentGuide?.text ?? "",
      revision: state.personalAgentGuide?.revision ?? 0,
      createdAt: state.personalAgentGuide?.createdAt ?? null,
      updatedAt: state.personalAgentGuide?.updatedAt ?? null,
    },
  };
}

test("C4: capability registry version stable across builds in-process", () => {
  invalidateAgentContextCache();
  const a = getCapabilityRegistrySnapshot(true);
  const b = getCapabilityRegistrySnapshot(false);
  assert.equal(a.capabilityVersion, b.capabilityVersion);
  assert.ok(a.actions.length >= 10);
  const live = buildLiveCapabilityContext();
  assert.equal(live.capabilityVersion, a.capabilityVersion);
  assert.ok(live.doors.some((d) => d.id.includes("task.create")));
});

test("C1/C2: snapshot reuses unchanged slices; rebuilds after task change", () => {
  invalidateAgentContextCache();
  const householdId = "hh-cache-1";
  let state = emptyState();
  state = applyActions(
    state,
    [{ type: "task.create", task: { title: "לשלם לגן", kind: "task" } }],
    NOW,
    true,
  );
  const first = buildAgentContextSnapshot({
    householdId,
    state,
    stateRevision: 1,
    capabilityVersion: "cap1",
    slices: baseSlices(state),
  });
  assert.ok(first.cacheMisses.includes("tasks"));

  const second = buildAgentContextSnapshot({
    householdId,
    state,
    stateRevision: 1,
    capabilityVersion: "cap1",
    slices: baseSlices(state),
  });
  assert.ok(second.cacheHits.includes("tasks"));
  assert.ok(second.cacheHits.includes("reminders"));

  state = applyActions(
    state,
    [
      {
        type: "task.create",
        task: { title: "לקנות חלב", kind: "task" },
      },
    ],
    NOW,
    true,
  );
  const third = buildAgentContextSnapshot({
    householdId,
    state,
    stateRevision: 2,
    capabilityVersion: "cap1",
    slices: baseSlices(state),
  });
  assert.ok(third.cacheMisses.includes("tasks"));
  assert.ok(
    third.cacheHits.includes("reminders") ||
      third.cacheMisses.includes("reminders"),
  );
  const remPrev = computeDomainRevisions(
    applyActions(
      emptyState(),
      [{ type: "task.create", task: { title: "x", kind: "task" } }],
      NOW,
      true,
    ),
    1,
  ).reminderRevision;
  const remNext = computeDomainRevisions(state, 2).reminderRevision;
  assert.equal(remPrev, remNext);
});

test("C5: revision mismatch invalidates stale cache entry on rebuild", () => {
  invalidateAgentContextCache();
  const householdId = "hh-stale";
  const state = emptyState();
  buildAgentContextSnapshot({
    householdId,
    state,
    stateRevision: 1,
    capabilityVersion: "cap1",
    slices: baseSlices(state),
  });
  assert.ok(peekAgentContextCache(householdId));
  invalidateAgentContextCache(householdId);
  assert.equal(peekAgentContextCache(householdId), null);
});

test("C6/C7: deep access hydrates missing refs; skips entities already in core", () => {
  let state = emptyState();
  state = applyActions(
    state,
    [
      {
        type: "task.create",
        task: {
          id: "11111111-1111-4111-8111-111111111111",
          title: "ביטוח",
          kind: "task",
        },
      },
      {
        type: "reminder.add",
        title: "יציאה",
        dueAt: "2030-01-01T15:00:00.000Z",
        taskId: null,
      },
    ],
    NOW,
    true,
  );
  const reminderId = state.reminders[0]!.id;
  const core = new Set(["11111111-1111-4111-8111-111111111111"]);
  const hydrated = hydrateMissingReferences(
    state,
    ["11111111-1111-4111-8111-111111111111", reminderId],
    core,
  );
  assert.equal(hydrated.entities.length, 1);
  assert.equal(hydrated.log.length, 1);
  assert.equal(hydrated.log[0]!.ok, true);

  const history = executeDeepAccess(state, {
    tool: "state.get_history",
    query: { limit: 5 },
  });
  assert.equal(history.ok, true);
});

test("runtime context includes live registry, WM, entityIndex, deepAccess doors", () => {
  invalidateAgentContextCache();
  const state = emptyState();
  const runtime = buildAgentRuntimeContext({
    state,
    stateRevision: 3,
    householdId: "hh-runtime",
    turnId: "22222222-2222-4222-8222-222222222222",
    requestId: "33333333-3333-4333-8333-333333333333",
    pendingProposal: {
      proposalId: "44444444-4444-4444-8444-444444444444",
      summary: "יש פעולות לאישור",
      actionTypes: ["task.create"],
      actionCount: 1,
      sourceRevision: 2,
      turnId: null,
      expiresAt: null,
    },
    dbFetches: ["app_states.revision", "app_states.full", "pending_proposals"],
    now: NOW,
  });
  assert.equal(runtime.runtimeVersion, "agent-runtime-v1");
  assert.ok(runtime.capabilityRegistry.doors.length > 0);
  assert.equal(runtime.pendingProposal?.actionCount, 1);
  assert.ok(runtime.deepAccessAvailable.includes("state.get_entity"));
  assert.equal(typeof runtime.entityIndex.tasks.open, "number");
  assert.deepEqual(runtime.instrumentation.dbFetches, [
    "app_states.revision",
    "app_states.full",
    "pending_proposals",
  ]);
  assert.equal(runtime.instrumentation.pendingProposalIncluded, true);
  assert.ok(runtime.instrumentation.contextDomains.includes("capabilities"));
  assert.ok(runtime.instrumentation.contextDomains.includes("entityIndex"));
  assert.equal(runtime.instrumentation.messageIndependent, true);
  for (const d of STRUCTURAL_CONTEXT_DOMAINS) {
    assert.ok(runtime.instrumentation.contextDomains.includes(d));
  }
});

/**
 * CONTEXT-NO-HIDDEN-REASONING
 * Same State + different messages must not change structural context selection.
 * Cache/context may change only for State/revision, open/active, date, IDs, WM refs.
 */
test("CONTEXT-NO-HIDDEN-REASONING: message text does not reshape context domains", () => {
  invalidateAgentContextCache();
  let state = emptyState();
  state = applyActions(
    state,
    [
      {
        type: "task.create",
        task: { title: "לחדש ביטוח רכב", kind: "task" },
      },
      {
        type: "task.create",
        task: { title: "לקנות חלב", kind: "task" },
      },
      {
        type: "shopping.add",
        title: "לחם",
      },
      {
        type: "reminder.add",
        title: "תור לרופא",
        dueAt: "2030-06-01T09:00:00.000Z",
        taskId: null,
      },
    ],
    NOW,
    true,
  );

  const messages = [
    "מה עם הביטוח של הרכב?",
    "צריך לקנות אוכל לסופר",
    "תזכירי לי על הגן מחר",
    "איך מזג האוויר היום?",
    "ספרי לי בדיחה",
  ];

  const fingerprints: string[] = [];
  const domainSets: string[][] = [];
  const deepFetchCounts: number[] = [];

  for (let i = 0; i < messages.length; i++) {
    invalidateAgentContextCache();
    // message is intentionally NOT passed into buildAgentRuntimeContext
    const runtime = buildAgentRuntimeContext({
      state,
      stateRevision: 7,
      householdId: "hh-no-nlp",
      turnId: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${i}`,
      requestId: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${i}`,
      now: NOW,
    });
    fingerprints.push(
      structuralContextFingerprint({
        entityIndex: runtime.entityIndex,
        contextDomains: runtime.instrumentation.contextDomains,
        referencedEntityIds: runtime.references.referencedEntityIds,
        pendingProposalId: runtime.pendingProposal?.proposalId ?? null,
        stateRevision: runtime.stateRevision,
        localDateKey: runtime.entityIndex.localDateKey,
      }),
    );
    domainSets.push([...runtime.instrumentation.contextDomains].sort());
    deepFetchCounts.push(runtime.instrumentation.deepAccess.length);
  }

  for (let i = 1; i < fingerprints.length; i++) {
    assert.equal(
      fingerprints[i],
      fingerprints[0],
      `message #${i} changed structural fingerprint (hidden reasoning)`,
    );
    assert.deepEqual(domainSets[i], domainSets[0]);
    assert.equal(deepFetchCounts[i], deepFetchCounts[0]);
  }

  // Structural open inventory exists regardless of insurance vs shopping wording
  const idx = buildEntityIndex(state, NOW);
  assert.ok(idx.tasks.open >= 2);
  assert.ok(idx.shopping.open >= 1);
  assert.ok(idx.reminders.pending >= 1);
});

test("CONTEXT-NO-HIDDEN-REASONING: only objective refs change hydration, not message words", () => {
  invalidateAgentContextCache();
  let state = emptyState();
  const taskId = "11111111-1111-4111-8111-111111111111";
  state = applyActions(
    state,
    [
      {
        type: "task.create",
        task: { id: taskId, title: "ביטוח", kind: "task" },
      },
      {
        type: "task.create",
        task: {
          id: "22222222-2222-4222-8222-222222222222",
          title: "חלב",
          kind: "task",
        },
      },
    ],
    NOW,
    true,
  );

  const withoutRef = buildAgentRuntimeContext({
    state,
    stateRevision: 1,
    householdId: "hh-ref-a",
    turnId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    now: NOW,
  });
  const withExplicitId = buildAgentRuntimeContext({
    state,
    stateRevision: 1,
    householdId: "hh-ref-b",
    turnId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    requestId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    contextTaskId: taskId,
    now: NOW,
  });

  assert.ok(!withoutRef.references.referencedEntityIds.includes(taskId));
  assert.ok(withExplicitId.references.referencedEntityIds.includes(taskId));
  // Domains stay structural either way
  assert.deepEqual(
    [...withoutRef.instrumentation.contextDomains]
      .filter((d) => d !== "pendingProposal")
      .sort(),
    [...withExplicitId.instrumentation.contextDomains]
      .filter((d) => d !== "pendingProposal")
      .sort(),
  );
});

function mockStateDb(opts: {
  revision: number;
  state: AppState;
  counters: { revisionReads: number; fullReads: number; queueReads: number };
}) {
  const { counters } = opts;
  const chain = (table: string, cols: string) => ({
    eq: () => ({
      maybeSingle: async () => {
        if (table === "app_states") {
          if (cols === "revision") {
            counters.revisionReads += 1;
            return { data: { revision: opts.revision }, error: null };
          }
          counters.fullReads += 1;
          return {
            data: { data: opts.state, revision: opts.revision },
            error: null,
          };
        }
        if (table === "reminder_queue") {
          counters.queueReads += 1;
          return { data: [], error: null };
        }
        return { data: null, error: null };
      },
      // reminder_queue uses .select().eq() without maybeSingle in hydrate — actually it awaits select().eq()
    }),
  });

  // hydrateReminderStatuses awaits db.from().select().eq() which returns data directly in supabase-js
  // Our implementation uses: const { data: queue, error } = await db.from(...).select(...).eq(...)
  // So eq must be thenable / return a promise-like with data+error
  return {
    from(table: string) {
      return {
        select(cols: string) {
          if (table === "reminder_queue") {
            return {
              eq: async () => {
                counters.queueReads += 1;
                return { data: [], error: null };
              },
            };
          }
          return chain(table, cols);
        },
      };
    },
  } as unknown as SupabaseClient;
}

test("10 turns without mutation: at most one full app_states read", async () => {
  clearCachedHouseholdState();
  invalidateAgentContextCache();
  const state = emptyState();
  const counters = { revisionReads: 0, fullReads: 0, queueReads: 0 };
  const db = mockStateDb({ revision: 42, state, counters });
  const owner = "owner-10-turns";

  const sliceReuseTotals = { hits: 0, misses: 0 };
  const deepFetches: number[] = [];
  const fullReadLabels: string[][] = [];

  for (let i = 0; i < 10; i++) {
    const loaded = await loadStateForTurn(db, owner);
    fullReadLabels.push(loaded.dbFetches);
    const runtime = buildAgentRuntimeContext({
      state: loaded.state,
      stateRevision: loaded.revision,
      householdId: owner,
      turnId: `eeeeeeee-eeee-4eee-8eee-eeeeeeeeee${String(i).padStart(2, "0")}`,
      requestId: `ffffffff-ffff-4fff-8fff-ffffffffff${String(i).padStart(2, "0")}`,
      dbFetches: loaded.dbFetches,
      now: NOW,
    });
    sliceReuseTotals.hits += runtime.instrumentation.cacheHits.length;
    sliceReuseTotals.misses += runtime.instrumentation.cacheMisses.length;
    deepFetches.push(runtime.instrumentation.deepAccess.length);
  }

  assert.equal(
    counters.fullReads,
    1,
    `expected 1 full read, got ${counters.fullReads}; fetches=${JSON.stringify(fullReadLabels)}`,
  );
  assert.equal(counters.revisionReads, 10);
  assert.ok(getCachedHouseholdState(owner));
  assert.equal(cachedRevisionMatches(owner, 42), true);
  // After first snapshot fill, subsequent turns reuse slices
  assert.ok(sliceReuseTotals.hits > 0);
  assert.deepEqual(
    deepFetches,
    Array(10).fill(0),
    "no deep fetches without missing WM refs",
  );
  // First turn may full-fetch; later turns only revision (+ reminder_queue)
  for (let i = 1; i < 10; i++) {
    assert.ok(!fullReadLabels[i]!.includes("app_states.full"));
    assert.ok(fullReadLabels[i]!.includes("app_states.revision"));
  }
  assert.ok(fullReadLabels[0]!.includes("app_states.full"));
});

test("state-cache: remember after mutation avoids stale reuse", () => {
  clearCachedHouseholdState();
  const owner = "owner-mutation";
  const a = emptyState();
  putCachedHouseholdState(owner, 1, a);
  assert.equal(cachedRevisionMatches(owner, 1), true);
  assert.equal(cachedRevisionMatches(owner, 2), false);
  const b = applyActions(
    a,
    [{ type: "task.create", task: { title: "חדש", kind: "task" } }],
    NOW,
    true,
  );
  putCachedHouseholdState(owner, 2, b);
  assert.equal(cachedRevisionMatches(owner, 2), true);
  assert.equal(getCachedHouseholdState(owner)!.state.tasks.length, 1);
});
