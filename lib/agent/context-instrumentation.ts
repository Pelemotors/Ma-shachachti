/**
 * Turn-level instrumentation for agent context + DB access.
 * No personal content — only structural metrics.
 */
import type { AgentRuntimeInstrumentation } from "@/lib/agent/runtime-context";

export type AgentTurnTrace = AgentRuntimeInstrumentation & {
  stage: "context_built" | "model_called" | "completed" | "failed";
  model?: string;
  latencyMs?: number;
  errorCode?: string;
};

export function summarizeContextTrace(trace: AgentTurnTrace) {
  return {
    turnId: trace.turnId,
    requestId: trace.requestId,
    stage: trace.stage,
    stateRevision: trace.stateRevision,
    capabilityVersion: trace.capabilityVersion,
    cacheHits: trace.cacheHits,
    cacheMisses: trace.cacheMisses,
    dbFetches: trace.dbFetches,
    deepAccessCount: trace.deepAccess.length,
    deepAccessOk: trace.deepAccess.filter((d) => d.ok).length,
    contextDomains: trace.contextDomains,
    pendingProposalIncluded: trace.pendingProposalIncluded,
    coreEntityCount: trace.coreEntityCount,
    hydratedReferenceCount: trace.hydratedReferenceCount,
    fromCache: trace.snapshot.fromCache,
    rebuiltSlices: trace.snapshot.rebuiltSlices,
    model: trace.model,
    latencyMs: trace.latencyMs,
    errorCode: trace.errorCode,
  };
}

export function logAgentContextTrace(trace: AgentTurnTrace) {
  // Structured log for operators — no message text / PII.
  console.info(
    "[agent.context]",
    JSON.stringify(summarizeContextTrace(trace)),
  );
}
