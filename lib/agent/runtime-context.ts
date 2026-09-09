/**
 * AgentRuntimeContext — single structured payload for the personal agent per turn.
 * Records + capabilities only; no intent taxonomy.
 */
import type { AppState } from "@/lib/model";
import {
  buildAgentContext,
  type AgentSurfaceContext,
} from "@/lib/domain/agent-context";
import { buildLiveCapabilityContext } from "@/lib/agent/capability-registry";
import {
  buildAgentContextSnapshot,
  type AgentContextSnapshotMeta,
} from "@/lib/agent/context-snapshot";
import {
  DEEP_ACCESS_TOOLS,
  hydrateMissingReferences,
  type DeepAccessLog,
} from "@/lib/agent/deep-access";
import { filterSafeDeferActions } from "@/lib/domain/tasks/deferrable";
import { sanitizeWorkingMemory } from "@/lib/domain/working-memory";

export type PendingProposalContext = {
  proposalId: string;
  summary: string;
  actionTypes: string[];
  actionCount: number;
  sourceRevision: number;
  turnId: string | null;
  expiresAt: string | null;
} | null;

export type AgentRuntimeInstrumentation = {
  turnId: string;
  requestId: string;
  stateRevision: number;
  capabilityVersion: string;
  snapshot: AgentContextSnapshotMeta;
  cacheHits: string[];
  cacheMisses: string[];
  dbFetches: string[];
  deepAccess: DeepAccessLog[];
  contextDomains: string[];
  pendingProposalIncluded: boolean;
  coreEntityCount: number;
  hydratedReferenceCount: number;
};

export type AgentRuntimeContext = {
  runtimeVersion: "agent-runtime-v1";
  turnId: string;
  requestId: string;
  stateRevision: number;
  capabilityRegistry: ReturnType<typeof buildLiveCapabilityContext>;
  workingMemory: ReturnType<typeof sanitizeWorkingMemory>;
  pendingProposal: PendingProposalContext;
  references: {
    relevantEntityIds: string[];
    hydratedEntities: unknown[];
  };
  deepAccessAvailable: readonly string[];
  knowledge: ReturnType<typeof buildAgentContext>;
  deferrableCandidates: unknown[];
  protectedFromDefer: unknown[];
  instrumentation: AgentRuntimeInstrumentation;
};

export function buildAgentRuntimeContext(input: {
  state: AppState;
  stateRevision: number;
  householdId: string;
  turnId: string;
  requestId: string;
  message?: string;
  contextTaskId?: string | null;
  surface?: "chat" | "memory" | "planning";
  surfaceContext?: AgentSurfaceContext | null;
  pendingProposal?: PendingProposalContext;
  /** Labels for DB reads that produced this turn's inputs */
  dbFetches?: string[];
  now?: Date;
}): AgentRuntimeContext {
  const now = input.now ?? new Date();
  const capabilityRegistry = buildLiveCapabilityContext();
  const knowledge = buildAgentContext(input.state, {
    now,
    contextTaskId: input.contextTaskId ?? null,
    turnId: input.turnId,
    surface: input.surface ?? "chat",
    surfaceContext: input.surfaceContext ?? null,
  });

  // Prefer live capability registry over static contract dump.
  const knowledgeForAgent = {
    ...knowledge,
    capabilityContract: capabilityRegistry,
    capabilityRegistry,
  };

  const wm = sanitizeWorkingMemory(input.state.agentWorkingMemory, now);
  const deferral = filterSafeDeferActions(input.state, [], now);

  const coreEntityIds = new Set<string>();
  for (const t of knowledge.tasks as { id: string }[]) coreEntityIds.add(t.id);
  for (const r of knowledge.reminders as { id: string }[])
    coreEntityIds.add(r.id);
  for (const r of knowledge.routines as { id: string }[])
    coreEntityIds.add(r.id);
  if (input.contextTaskId) coreEntityIds.add(input.contextTaskId);

  const relevantEntityIds = [
    ...new Set([
      ...(wm?.relevantEntityIds ?? []),
      ...(wm?.openLoops.flatMap((l) => l.relevantEntityIds) ?? []),
      ...(input.contextTaskId ? [input.contextTaskId] : []),
    ]),
  ].slice(0, 40);

  const hydrated = hydrateMissingReferences(
    input.state,
    relevantEntityIds,
    coreEntityIds,
  );

  const snapshotSlices = {
    core: {
      profile: knowledge.profile,
      timezone: knowledge.timezone,
      localDateKey: knowledge.localDateKey,
    },
    tasks: knowledge.tasks,
    reminders: knowledge.reminders,
    routines: knowledge.routines,
    home: { homeAreas: knowledge.homeAreas, firstScan: knowledge.firstScan },
    memory: {
      facts: knowledge.facts,
      compactedMemory: knowledge.compactedMemory,
      learning: knowledge.learning,
    },
    plan: {
      dailyPlan: knowledge.dailyPlan,
      planningConstraint: knowledge.planningConstraint,
    },
    shopping: knowledge.shopping,
    messages: knowledge.history,
    workingMemory: wm,
  };

  const snapshot = buildAgentContextSnapshot({
    householdId: input.householdId,
    state: input.state,
    stateRevision: input.stateRevision,
    capabilityVersion: capabilityRegistry.capabilityVersion,
    slices: snapshotSlices,
  });

  const pendingProposal = input.pendingProposal ?? null;
  const dbFetches = [...(input.dbFetches ?? [])];

  const instrumentation: AgentRuntimeInstrumentation = {
    turnId: input.turnId,
    requestId: input.requestId,
    stateRevision: input.stateRevision,
    capabilityVersion: capabilityRegistry.capabilityVersion,
    snapshot: snapshot.meta,
    cacheHits: snapshot.cacheHits,
    cacheMisses: snapshot.cacheMisses,
    dbFetches,
    deepAccess: hydrated.log,
    contextDomains: [
      "profile",
      "tasks",
      "reminders",
      "routines",
      "home",
      "memory",
      "plan",
      "shopping",
      "messages",
      "workingMemory",
      "capabilities",
      ...(pendingProposal ? (["pendingProposal"] as const) : []),
    ],
    pendingProposalIncluded: Boolean(pendingProposal),
    coreEntityCount: coreEntityIds.size,
    hydratedReferenceCount: hydrated.entities.length,
  };

  return {
    runtimeVersion: "agent-runtime-v1",
    turnId: input.turnId,
    requestId: input.requestId,
    stateRevision: input.stateRevision,
    capabilityRegistry,
    workingMemory: wm,
    pendingProposal,
    references: {
      relevantEntityIds,
      hydratedEntities: hydrated.entities,
    },
    deepAccessAvailable: DEEP_ACCESS_TOOLS,
    knowledge: knowledgeForAgent as unknown as ReturnType<
      typeof buildAgentContext
    >,
    deferrableCandidates: deferral.candidates.slice(0, 60),
    protectedFromDefer: deferral.protected.slice(0, 40),
    instrumentation,
  };
}

/** Payload sent to the LLM — runtime context without heavy instrumentation internals. */
export function toAgentModelInput(
  runtime: AgentRuntimeContext,
  message: string,
) {
  return {
    message,
    runtime: {
      runtimeVersion: runtime.runtimeVersion,
      turnId: runtime.turnId,
      stateRevision: runtime.stateRevision,
      capabilityRegistry: runtime.capabilityRegistry,
      workingMemory: runtime.workingMemory,
      pendingProposal: runtime.pendingProposal,
      references: runtime.references,
      deepAccessAvailable: runtime.deepAccessAvailable,
      knowledge: runtime.knowledge,
      deferrableCandidates: runtime.deferrableCandidates,
      protectedFromDefer: runtime.protectedFromDefer,
    },
  };
}
