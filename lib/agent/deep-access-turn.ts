/**
 * In-turn read-only Deep Access loop helpers.
 * The LLM chooses which door/ID to open. Code does not pick by keywords.
 */
import type { AppState } from "@/lib/model";
import {
  DEEP_ACCESS_TOOLS,
  executeDeepAccess,
  type DeepAccessLog,
  type DeepAccessRequest,
  type DeepAccessTool,
} from "@/lib/agent/deep-access";

export const MAX_DEEP_ACCESS_ROUNDS = 3;
export const MAX_DEEP_ACCESS_CALLS_PER_TURN = 6;
export const MAX_DEEP_ACCESS_CALLS_PER_ROUND = 3;

export type DeepAccessTurnHit = {
  round: number;
  tool: DeepAccessTool;
  entityId?: string;
  ok: boolean;
  error?: string;
  data: unknown;
};

export type DeepAccessModelView = {
  readOnly: true;
  tools: readonly string[];
  maxCallsPerTurn: number;
  maxCallsPerRound: number;
  remainingCalls: number;
  budgetExhausted: boolean;
  results: DeepAccessTurnHit[];
};

const ALLOWED_TOOLS = new Set<string>(DEEP_ACCESS_TOOLS);

export function parseDeepAccessRequests(raw: unknown): DeepAccessRequest[] {
  if (!Array.isArray(raw)) return [];
  const out: DeepAccessRequest[] = [];
  for (const item of raw) {
    if (out.length >= MAX_DEEP_ACCESS_CALLS_PER_ROUND) break;
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.tool !== "string" || !ALLOWED_TOOLS.has(row.tool)) continue;
    const request: DeepAccessRequest = {
      tool: row.tool as DeepAccessTool,
    };
    if (typeof row.entityId === "string" && row.entityId.trim()) {
      request.entityId = row.entityId.trim().slice(0, 80);
    }
    if (
      row.query &&
      typeof row.query === "object" &&
      !Array.isArray(row.query)
    ) {
      const q = row.query as Record<string, unknown>;
      request.query = {};
      if (Array.isArray(q.status)) {
        request.query.status = q.status
          .filter((s): s is string => typeof s === "string")
          .slice(0, 8);
      }
      if (typeof q.limit === "number" && Number.isInteger(q.limit)) {
        request.query.limit = Math.min(Math.max(q.limit, 1), 100);
      }
      if (typeof q.since === "string") {
        request.query.since = q.since.slice(0, 40);
      }
      if (typeof q.cursor === "string" && q.cursor.trim()) {
        request.query.cursor = q.cursor.trim().slice(0, 80);
      }
      if (typeof q.before === "string") {
        request.query.before = q.before.slice(0, 40);
      }
      if (typeof q.after === "string") {
        request.query.after = q.after.slice(0, 40);
      }
      if (typeof q.compact === "boolean") {
        request.query.compact = q.compact;
      }
      if (typeof q.text === "string") {
        request.query.text = q.text.slice(0, 200);
      }
    }
    out.push(request);
  }
  return out;
}

export function executeDeepAccessRound(input: {
  state: AppState;
  requests: DeepAccessRequest[];
  round: number;
  callsUsed: number;
  coreEntityIds?: Set<string>;
}): {
  hits: DeepAccessTurnHit[];
  log: DeepAccessLog[];
  callsUsed: number;
} {
  const remaining = Math.max(
    0,
    MAX_DEEP_ACCESS_CALLS_PER_TURN - input.callsUsed,
  );
  const toRun = input.requests.slice(
    0,
    Math.min(MAX_DEEP_ACCESS_CALLS_PER_ROUND, remaining),
  );
  const hits: DeepAccessTurnHit[] = [];
  const log: DeepAccessLog[] = [];
  let callsUsed = input.callsUsed;
  for (const request of toRun) {
    const executed = executeDeepAccess(input.state, request, {
      coreEntityIds: input.coreEntityIds,
    });
    hits.push({
      round: input.round,
      tool: executed.tool,
      entityId: request.entityId,
      ok: executed.ok,
      error: executed.error,
      data: executed.data,
    });
    log.push({
      tool: executed.tool,
      ok: executed.ok,
      fromCoreHint: executed.fromCoreHint,
      round: input.round,
      error: executed.error,
      source: "llm_request",
    });
    callsUsed += 1;
  }
  return { hits, log, callsUsed };
}

export function toDeepAccessModelView(input: {
  remainingCalls: number;
  budgetExhausted: boolean;
  results: DeepAccessTurnHit[];
}): DeepAccessModelView {
  return {
    readOnly: true,
    tools: DEEP_ACCESS_TOOLS,
    maxCallsPerTurn: MAX_DEEP_ACCESS_CALLS_PER_TURN,
    maxCallsPerRound: MAX_DEEP_ACCESS_CALLS_PER_ROUND,
    remainingCalls: Math.max(0, input.remainingCalls),
    budgetExhausted: input.budgetExhausted,
    results: input.results,
  };
}
