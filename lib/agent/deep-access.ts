/**
 * Read-only deep access — open a door into state when core context is insufficient.
 * Never mutates. Never interprets natural language.
 */
import type { AppState } from "@/lib/model";
import { activeFacts } from "@/lib/engine";

export const DEEP_ACCESS_TOOLS = [
  "state.get_entity",
  "state.list_tasks",
  "state.get_history",
  "state.get_behavior_events",
  "state.get_scan_history",
  "state.get_forecast_evidence",
  "state.get_agent_guide",
] as const;

export type DeepAccessTool = (typeof DEEP_ACCESS_TOOLS)[number];

export type DeepAccessRequest = {
  tool: DeepAccessTool;
  entityId?: string;
  query?: {
    status?: string[];
    limit?: number;
    since?: string;
  };
};

export type DeepAccessResult = {
  tool: DeepAccessTool;
  ok: boolean;
  fromCoreHint: boolean;
  data: unknown;
  error?: string;
};

export type DeepAccessLog = {
  tool: DeepAccessTool;
  ok: boolean;
  fromCoreHint: boolean;
};

function findEntity(state: AppState, id: string) {
  const task = state.tasks.find((t) => t.id === id);
  if (task) return { kind: "task", entity: task };
  const reminder = state.reminders.find((r) => r.id === id);
  if (reminder) return { kind: "reminder", entity: reminder };
  const routine = state.routines.find((r) => r.id === id);
  if (routine) return { kind: "routine", entity: routine };
  const fact = state.facts.find((f) => f.id === id);
  if (fact) return { kind: "fact", entity: fact };
  const member = state.members.find((m) => m.id === id);
  if (member) return { kind: "member", entity: member };
  const area = state.homeAreas.find((a) => a.id === id);
  if (area) return { kind: "homeArea", entity: area };
  const shopping = state.shopping.find((s) => s.id === id);
  if (shopping) return { kind: "shopping", entity: shopping };
  return null;
}

export function executeDeepAccess(
  state: AppState,
  req: DeepAccessRequest,
  opts?: { coreEntityIds?: Set<string>; now?: Date },
): DeepAccessResult {
  const core = opts?.coreEntityIds ?? new Set<string>();
  const fromCoreHint = req.entityId ? core.has(req.entityId) : false;
  const limit = Math.min(req.query?.limit ?? 40, 100);

  try {
    switch (req.tool) {
      case "state.get_entity": {
        if (!req.entityId)
          return {
            tool: req.tool,
            ok: false,
            fromCoreHint,
            data: null,
            error: "entityId required",
          };
        const hit = findEntity(state, req.entityId);
        return {
          tool: req.tool,
          ok: Boolean(hit),
          fromCoreHint,
          data: hit,
          error: hit ? undefined : "not_found",
        };
      }
      case "state.list_tasks": {
        const statuses = req.query?.status;
        let tasks = state.tasks;
        if (statuses?.length)
          tasks = tasks.filter((t) => statuses.includes(t.status));
        return {
          tool: req.tool,
          ok: true,
          fromCoreHint: false,
          data: tasks.slice(-limit).map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            dueAt: t.dueAt,
            priority: t.priority,
            categoryId: t.categoryId,
            completedAt: t.completedAt,
            updatedAt: t.updatedAt,
          })),
        };
      }
      case "state.get_history": {
        return {
          tool: req.tool,
          ok: true,
          fromCoreHint: false,
          data: {
            messages: state.messages.slice(-(req.query?.limit ?? 40)),
            operations: state.operations.slice(-(req.query?.limit ?? 20)),
          },
        };
      }
      case "state.get_behavior_events": {
        // Evidence from completions / suggestion history — raw facts, no inference.
        const completed = state.tasks
          .filter((t) => t.status === "done" && t.completedAt)
          .slice(-limit)
          .map((t) => ({
            eventType: "task.completed",
            entityId: t.id,
            title: t.title,
            occurredAt: t.completedAt,
            duration: t.actualWorkMinutes,
          }));
        const suggestions = state.suggestionHistory.slice(-limit).map((s) => ({
          eventType: s.declinedAt
            ? "suggestion.declined"
            : s.selectedAt
              ? "suggestion.selected"
              : "suggestion.suggested",
          entityId: s.taskId,
          suggestionKey: s.suggestionKey,
          occurredAt: s.declinedAt ?? s.selectedAt ?? s.suggestedAt,
        }));
        return {
          tool: req.tool,
          ok: true,
          fromCoreHint: false,
          data: { completed, suggestions },
        };
      }
      case "state.get_scan_history": {
        const session = state.firstScan?.session;
        return {
          tool: req.tool,
          ok: true,
          fromCoreHint: false,
          data: {
            status: state.firstScan?.status ?? null,
            sessionStatus: session?.status ?? null,
            chunks: session?.chunks?.slice(-20) ?? [],
            draftAnalysis: session?.draftAnalysis ?? null,
          },
        };
      }
      case "state.get_forecast_evidence": {
        const now = opts?.now ?? new Date();
        return {
          tool: req.tool,
          ok: true,
          fromCoreHint: false,
          data: {
            learning: state.learning.slice(-limit),
            activeFacts: activeFacts(state, now)
              .slice(-limit)
              .map((f) => ({
                id: f.id,
                text: f.text,
                kind: f.kind,
                source: f.source,
              })),
          },
        };
      }
      case "state.get_agent_guide": {
        const g = state.personalAgentGuide;
        return {
          tool: req.tool,
          ok: true,
          fromCoreHint: false,
          data: g
            ? {
                exists: true,
                text: g.text,
                revision: g.revision,
                createdAt: g.createdAt,
                updatedAt: g.updatedAt,
              }
            : {
                exists: false,
                text: "",
                revision: 0,
                createdAt: null,
                updatedAt: null,
              },
        };
      }
      default:
        return {
          tool: req.tool,
          ok: false,
          fromCoreHint,
          data: null,
          error: "unknown_tool",
        };
    }
  } catch (e) {
    return {
      tool: req.tool,
      ok: false,
      fromCoreHint,
      data: null,
      error: e instanceof Error ? e.message : "error",
    };
  }
}

/**
 * If working-memory references entities absent from core task/reminder lists,
 * hydrate them via deep access (read-only).
 */
export function hydrateMissingReferences(
  state: AppState,
  relevantEntityIds: string[],
  coreEntityIds: Set<string>,
): { entities: unknown[]; log: DeepAccessLog[] } {
  const entities: unknown[] = [];
  const log: DeepAccessLog[] = [];
  for (const id of relevantEntityIds.slice(0, 20)) {
    if (coreEntityIds.has(id)) continue;
    const result = executeDeepAccess(
      state,
      { tool: "state.get_entity", entityId: id },
      { coreEntityIds },
    );
    log.push({
      tool: result.tool,
      ok: result.ok,
      fromCoreHint: result.fromCoreHint,
    });
    if (result.ok && result.data) entities.push(result.data);
  }
  return { entities, log };
}
