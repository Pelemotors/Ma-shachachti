/**
 * Domain-slice revisions + AgentContextSnapshot cache.
 * Snapshot records structural State slices; it does not interpret meaning.
 * Invalidation is revision/status/date based only — never message keywords.
 */
import { createHash } from "node:crypto";
import type { AppState } from "@/lib/model";
import { guideRevisionFingerprint } from "@/lib/domain/agent-guide";

export type DomainRevisions = {
  stateRevision: number;
  profileRevision: string;
  taskRevision: string;
  reminderRevision: string;
  routineRevision: string;
  homeRevision: string;
  checklistRevision: string;
  forecastRevision: string;
  memoryRevision: string;
  messageRevision: string;
  shoppingRevision: string;
  personalChecklistRevision: string;
  planRevision: string;
  processRevision: string;
  workingMemoryRevision: string;
  agentGuideRevision: string;
};

export type AgentContextSnapshotMeta = {
  householdId: string;
  stateRevision: number;
  domainRevisions: DomainRevisions;
  capabilityVersion: string;
  createdAt: string;
  slicesLoaded: string[];
  fromCache: boolean;
  rebuiltSlices: string[];
};

function hashSlice(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 12);
}

export function computeDomainRevisions(
  state: AppState,
  stateRevision: number,
): DomainRevisions {
  return {
    stateRevision,
    profileRevision: hashSlice([
      state.profile,
      state.members.map((m) => [m.id, m.name, m.type, m.aliases]),
    ]),
    taskRevision: hashSlice(
      state.tasks.map((t) => [t.id, t.updatedAt, t.status, t.title]),
    ),
    reminderRevision: hashSlice(
      state.reminders.map((r) => [r.id, r.dueAt, r.status, r.title]),
    ),
    routineRevision: hashSlice(
      state.routines.map((r) => [r.id, r.status, r.updatedAt, r.title]),
    ),
    homeRevision: hashSlice([
      state.homeAreas.map((a) => [a.id, a.name, a.type]),
      state.firstScan?.status,
      state.firstScan?.session?.updatedAt,
    ]),
    checklistRevision: hashSlice(
      state.tasks.map((t) => [t.id, t.steps?.map((s) => [s.id, s.done])]),
    ),
    forecastRevision: hashSlice(state.learning),
    memoryRevision: hashSlice([
      state.facts.map((f) => [f.id, f.text, f.kind, f.expiresAt]),
      state.compactedMemory,
    ]),
    messageRevision: hashSlice(
      state.messages.map((m) => [m.id, m.role, m.text.slice(0, 80)]),
    ),
    shoppingRevision: hashSlice(
      state.shopping.map((s) => [s.id, s.title, s.purchasedAt]),
    ),
    personalChecklistRevision: hashSlice(
      state.checklists.map((c) => [
        c.id,
        c.title,
        c.updatedAt,
        c.items.map((item) => [item.id, item.checked, item.order, item.text]),
      ]),
    ),
    planRevision: hashSlice([
      state.planning.dayContexts,
      state.planning.plans,
    ]),
    processRevision: hashSlice(
      state.operations.map((o) => [o.turnId, o.summary, o.createdAt, o.actionTypes]),
    ),
    workingMemoryRevision: hashSlice(state.agentWorkingMemory),
    agentGuideRevision: hashSlice(guideRevisionFingerprint(state)),
  };
}

/** Structural domain slices — mirrors Domain Model entities, not topics. */
export type SnapshotSlices = {
  profile: unknown;
  tasks: unknown;
  reminders: unknown;
  routines: unknown;
  plans: unknown;
  home: unknown;
  memory: unknown;
  checklists: unknown;
  forecasts: unknown;
  processes: unknown;
  shopping: unknown;
  personalChecklists: unknown;
  messages: unknown;
  workingMemory: unknown;
  entityIndex: unknown;
  personalAgentGuide: unknown;
};

type CacheEntry = {
  householdId: string;
  domainRevisions: DomainRevisions;
  capabilityVersion: string;
  slices: Partial<SnapshotSlices>;
  createdAt: string;
};

const cacheByHousehold = new Map<string, CacheEntry>();

export type SnapshotBuildResult = {
  meta: AgentContextSnapshotMeta;
  slices: SnapshotSlices;
  cacheHits: string[];
  cacheMisses: string[];
};

function sliceNeedsRebuild(
  prev: DomainRevisions | undefined,
  next: DomainRevisions,
  key: keyof DomainRevisions,
): boolean {
  if (!prev) return true;
  return prev[key] !== next[key];
}

/**
 * Build or reuse per-slice snapshot.
 * Does not accept or inspect user message text.
 */
export function buildAgentContextSnapshot(input: {
  householdId: string;
  state: AppState;
  stateRevision: number;
  capabilityVersion: string;
  slices: SnapshotSlices;
}): SnapshotBuildResult {
  const domainRevisions = computeDomainRevisions(
    input.state,
    input.stateRevision,
  );
  const prev = cacheByHousehold.get(input.householdId);
  const cacheHits: string[] = [];
  const cacheMisses: string[] = [];
  const rebuiltSlices: string[] = [];
  const nextSlices: SnapshotSlices = { ...input.slices };

  const mapping: {
    name: keyof SnapshotSlices;
    rev: keyof DomainRevisions;
  }[] = [
    { name: "profile", rev: "profileRevision" },
    { name: "tasks", rev: "taskRevision" },
    { name: "reminders", rev: "reminderRevision" },
    { name: "routines", rev: "routineRevision" },
    { name: "plans", rev: "planRevision" },
    { name: "home", rev: "homeRevision" },
    { name: "memory", rev: "memoryRevision" },
    { name: "checklists", rev: "checklistRevision" },
    { name: "forecasts", rev: "forecastRevision" },
    { name: "processes", rev: "processRevision" },
    { name: "shopping", rev: "shoppingRevision" },
    { name: "personalChecklists", rev: "personalChecklistRevision" },
    { name: "messages", rev: "messageRevision" },
    { name: "workingMemory", rev: "workingMemoryRevision" },
    { name: "entityIndex", rev: "stateRevision" },
    { name: "personalAgentGuide", rev: "agentGuideRevision" },
  ];

  const capabilityChanged =
    Boolean(prev) && prev!.capabilityVersion !== input.capabilityVersion;

  for (const { name, rev } of mapping) {
    const rebuild =
      !prev?.slices[name] ||
      sliceNeedsRebuild(prev.domainRevisions, domainRevisions, rev) ||
      capabilityChanged;
    if (rebuild) {
      cacheMisses.push(name);
      rebuiltSlices.push(name);
    } else {
      cacheHits.push(name);
      nextSlices[name] = prev!.slices[name]!;
    }
  }

  // entityIndex also tracks open/active inventory — rebuild if task/reminder/routine moved
  if (
    prev &&
    !rebuiltSlices.includes("entityIndex") &&
    (sliceNeedsRebuild(prev.domainRevisions, domainRevisions, "taskRevision") ||
      sliceNeedsRebuild(
        prev.domainRevisions,
        domainRevisions,
        "reminderRevision",
      ) ||
      sliceNeedsRebuild(
        prev.domainRevisions,
        domainRevisions,
        "routineRevision",
      ) ||
      sliceNeedsRebuild(
        prev.domainRevisions,
        domainRevisions,
        "checklistRevision",
      ) ||
      sliceNeedsRebuild(
        prev.domainRevisions,
        domainRevisions,
        "personalChecklistRevision",
      ) ||
      sliceNeedsRebuild(
        prev.domainRevisions,
        domainRevisions,
        "processRevision",
      ) ||
      sliceNeedsRebuild(
        prev.domainRevisions,
        domainRevisions,
        "workingMemoryRevision",
      ))
  ) {
    const idx = cacheHits.indexOf("entityIndex");
    if (idx >= 0) cacheHits.splice(idx, 1);
    if (!cacheMisses.includes("entityIndex")) cacheMisses.push("entityIndex");
    if (!rebuiltSlices.includes("entityIndex"))
      rebuiltSlices.push("entityIndex");
    nextSlices.entityIndex = input.slices.entityIndex;
  }

  const entry: CacheEntry = {
    householdId: input.householdId,
    domainRevisions,
    capabilityVersion: input.capabilityVersion,
    slices: nextSlices,
    createdAt: new Date().toISOString(),
  };
  cacheByHousehold.set(input.householdId, entry);

  return {
    meta: {
      householdId: input.householdId,
      stateRevision: input.stateRevision,
      domainRevisions,
      capabilityVersion: input.capabilityVersion,
      createdAt: entry.createdAt,
      slicesLoaded: Object.keys(nextSlices),
      fromCache: cacheHits.length > 0 && cacheMisses.length === 0,
      rebuiltSlices,
    },
    slices: nextSlices,
    cacheHits,
    cacheMisses,
  };
}

export function invalidateAgentContextCache(householdId?: string) {
  if (householdId) cacheByHousehold.delete(householdId);
  else cacheByHousehold.clear();
}

export function peekAgentContextCache(householdId: string) {
  return cacheByHousehold.get(householdId) ?? null;
}

/** Fixed structural domain list sent every turn (not message-dependent). */
export const STRUCTURAL_CONTEXT_DOMAINS = [
  "profile",
  "tasks",
  "reminders",
  "routines",
  "plans",
  "home",
  "memory",
  "checklists",
  "forecasts",
  "processes",
  "shopping",
  "personalChecklists",
  "messages",
  "workingMemory",
  "entityIndex",
  "personalAgentGuide",
  "capabilities",
] as const;
