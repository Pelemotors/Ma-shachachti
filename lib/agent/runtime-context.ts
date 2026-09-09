/**
 * AgentRuntimeContext — structural State + capabilities for the personal agent.
 *
 * Cache / snapshot decide where data lives and whether it changed.
 * The agent alone decides what is meaningful for the current conversation.
 * Do not select domains from message keywords, taxonomy, or relevance classifiers.
 */
import type { AppState } from "@/lib/model";
import {
  buildAgentContext,
  type AgentSurfaceContext,
} from "@/lib/domain/agent-context";
import { buildLiveCapabilityContext } from "@/lib/agent/capability-registry";
import {
  buildAgentContextSnapshot,
  STRUCTURAL_CONTEXT_DOMAINS,
  type AgentContextSnapshotMeta,
} from "@/lib/agent/context-snapshot";
import {
  DEEP_ACCESS_TOOLS,
  hydrateMissingReferences,
  type DeepAccessLog,
} from "@/lib/agent/deep-access";
import {
  toDeepAccessModelView,
  type DeepAccessModelView,
  type DeepAccessTurnHit,
  MAX_DEEP_ACCESS_CALLS_PER_TURN,
} from "@/lib/agent/deep-access-turn";
import {
  buildEntityIndex,
  type AgentEntityIndex,
} from "@/lib/agent/entity-index";
import {
  toRuntimePersonalAgentGuide,
  type RuntimePersonalAgentGuide,
} from "@/lib/domain/agent-guide";
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
  /** True when context shape ignored message text (always expected true). */
  messageIndependent: true;
};

export type AgentRuntimeContext = {
  runtimeVersion: "agent-runtime-v1";
  turnId: string;
  requestId: string;
  stateRevision: number;
  capabilityRegistry: ReturnType<typeof buildLiveCapabilityContext>;
  workingMemory: ReturnType<typeof sanitizeWorkingMemory>;
  pendingProposal: PendingProposalContext;
  /** Opaque guide document — always present as exists true/false. */
  personalAgentGuide: RuntimePersonalAgentGuide;
  /** Structural inventory — counts / open-active / IDs. */
  entityIndex: AgentEntityIndex;
  references: {
    /** IDs from Working Memory + explicit contextTaskId — not NLP extraction. */
    referencedEntityIds: string[];
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
  /**
   * Explicit UI selection (task id). Allowed: objective reference.
   * Must not be confused with message-based domain picking.
   */
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

  const knowledgeForAgent = {
    ...knowledge,
    capabilityContract: capabilityRegistry,
    capabilityRegistry,
  };

  const wm = sanitizeWorkingMemory(input.state.agentWorkingMemory, now);
  const deferral = filterSafeDeferActions(input.state, [], now);
  const entityIndex = buildEntityIndex(input.state, now);
  const personalAgentGuide = toRuntimePersonalAgentGuide(input.state);

  const coreEntityIds = new Set<string>();
  for (const t of knowledge.tasks as { id: string }[]) coreEntityIds.add(t.id);
  for (const r of knowledge.reminders as { id: string }[])
    coreEntityIds.add(r.id);
  for (const r of knowledge.routines as { id: string }[])
    coreEntityIds.add(r.id);
  const checklists = (
    knowledge as { personalChecklists?: { full?: { id: string }[] } }
  ).personalChecklists;
  for (const c of checklists?.full ?? []) coreEntityIds.add(c.id);
  if (input.contextTaskId) coreEntityIds.add(input.contextTaskId);

  const referencedEntityIds = [
    ...new Set([
      ...(wm?.relevantEntityIds ?? []),
      ...(wm?.openLoops.flatMap((l) => l.relevantEntityIds) ?? []),
      ...(input.contextTaskId ? [input.contextTaskId] : []),
    ]),
  ].slice(0, 40);

  const hydrated = hydrateMissingReferences(
    input.state,
    referencedEntityIds,
    coreEntityIds,
  );

  const snapshotSlices = {
    profile: {
      profile: knowledge.profile,
      timezone: knowledge.timezone,
      localDateKey: knowledge.localDateKey,
      members: knowledge.members,
    },
    tasks: knowledge.tasks,
    reminders: knowledge.reminders,
    routines: knowledge.routines,
    plans: {
      dailyPlan: knowledge.dailyPlan,
      planningConstraint: knowledge.planningConstraint,
    },
    home: { homeAreas: knowledge.homeAreas, firstScan: knowledge.firstScan },
    memory: {
      facts: knowledge.facts,
      compactedMemory: knowledge.compactedMemory,
      learning: knowledge.learning,
    },
    checklists: (knowledge.tasks as { id: string; steps?: unknown[] }[]).map(
      (t) => ({ id: t.id, steps: t.steps ?? [] }),
    ),
    forecasts: knowledge.learning,
    processes: input.state.operations.slice(-40),
    shopping: knowledge.shopping,
    personalChecklists: knowledge.personalChecklists,
    messages: knowledge.history,
    workingMemory: wm,
    entityIndex,
    personalAgentGuide,
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

  const contextDomains = [
    ...STRUCTURAL_CONTEXT_DOMAINS,
    ...(pendingProposal ? (["pendingProposal"] as const) : []),
  ];

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
    contextDomains: [...contextDomains],
    pendingProposalIncluded: Boolean(pendingProposal),
    coreEntityCount: coreEntityIds.size,
    hydratedReferenceCount: hydrated.entities.length,
    messageIndependent: true,
  };

  return {
    runtimeVersion: "agent-runtime-v1",
    turnId: input.turnId,
    requestId: input.requestId,
    stateRevision: input.stateRevision,
    capabilityRegistry,
    workingMemory: wm,
    pendingProposal,
    personalAgentGuide,
    entityIndex,
    references: {
      referencedEntityIds,
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
  extras?: {
    deepAccessResults?: DeepAccessTurnHit[];
    remainingCalls?: number;
    budgetExhausted?: boolean;
  },
) {
  const remaining =
    extras?.remainingCalls ?? MAX_DEEP_ACCESS_CALLS_PER_TURN;
  const deepAccess: DeepAccessModelView = toDeepAccessModelView({
    remainingCalls: remaining,
    budgetExhausted: Boolean(extras?.budgetExhausted),
    results: extras?.deepAccessResults ?? [],
  });
  return {
    message,
    runtime: {
      runtimeVersion: runtime.runtimeVersion,
      turnId: runtime.turnId,
      stateRevision: runtime.stateRevision,
      capabilityRegistry: runtime.capabilityRegistry,
      workingMemory: runtime.workingMemory,
      pendingProposal: runtime.pendingProposal,
      personalAgentGuide: runtime.personalAgentGuide,
      entityIndex: runtime.entityIndex,
      references: runtime.references,
      deepAccessAvailable: runtime.deepAccessAvailable,
      deepAccess,
      knowledge: runtime.knowledge,
      deferrableCandidates: runtime.deferrableCandidates,
      protectedFromDefer: runtime.protectedFromDefer,
    },
  };
}
