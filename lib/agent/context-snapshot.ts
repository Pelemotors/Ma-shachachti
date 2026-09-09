/**
 * Domain-slice revisions + AgentContextSnapshot cache.
 * Snapshot records reality for the agent; it does not interpret meaning.
 */
import { createHash } from "node:crypto";
import type { AppState } from "@/lib/model";

export type DomainRevisions = {
  stateRevision: number;
  taskRevision: string;
  reminderRevision: string;
  routineRevision: string;
  homeRevision: string;
  checklistRevision: string;
  forecastRevision: string;
  memoryRevision: string;
  messageRevision: string;
  shoppingRevision: string;
  planRevision: string;
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
      state.agentWorkingMemory?.updatedAt,
    ]),
    messageRevision: hashSlice(
      state.messages.map((m) => [m.id, m.role, m.text.slice(0, 80)]),
    ),
    shoppingRevision: hashSlice(
      state.shopping.map((s) => [s.id, s.title, s.purchasedAt]),
    ),
    planRevision: hashSlice([state.planning.today, state.planning.plan]),
  };
}

export type SnapshotSlices = {
  core: unknown;
  tasks: unknown;
  reminders: unknown;
  routines: unknown;
  home: unknown;
  memory: unknown;
  plan: unknown;
  shopping: unknown;
  messages: unknown;
  workingMemory: unknown;
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
 * Build or reuse per-slice snapshot. Capability registry is not rebuilt here.
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
    { name: "tasks", rev: "taskRevision" },
    { name: "reminders", rev: "reminderRevision" },
    { name: "routines", rev: "routineRevision" },
    { name: "home", rev: "homeRevision" },
    { name: "memory", rev: "memoryRevision" },
    { name: "plan", rev: "planRevision" },
    { name: "shopping", rev: "shoppingRevision" },
    { name: "messages", rev: "messageRevision" },
    { name: "workingMemory", rev: "memoryRevision" },
    { name: "core", rev: "stateRevision" },
  ];

  for (const { name, rev } of mapping) {
    const rebuild =
      !prev?.slices[name] ||
      sliceNeedsRebuild(prev.domainRevisions, domainRevisions, rev) ||
      prev.capabilityVersion !== input.capabilityVersion;
    if (rebuild) {
      cacheMisses.push(name);
      rebuiltSlices.push(name);
      // keep input.slices[name]
    } else {
      cacheHits.push(name);
      nextSlices[name] = prev!.slices[name]!;
    }
  }

  // core always tracks full revision number — if stateRevision changed, rebuild core
  if (
    prev &&
    prev.domainRevisions.stateRevision === domainRevisions.stateRevision &&
    prev.slices.core
  ) {
    if (!cacheHits.includes("core")) {
      /* already handled */
    }
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
