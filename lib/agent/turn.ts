import type { ChatSurface } from "../home-surfaces.ts";
import type { SurfaceContext } from "../chat-request.ts";
import type { AgentPresentation } from "../types.ts";
import {
  buildAgentPrompt,
  surfaceInputHint,
} from "./prompt-builder.ts";
import { buildCompactContext, type CompactContext } from "./context/compact.ts";
import type {
  ConsequenceRow,
  MemoryRow,
  TaskRow,
} from "../types.ts";
import type { Checklist, ShoppingItem } from "../lists.ts";
import type { AgentProfileContext } from "../user-profile.ts";
import { TIME_ZONE, todayContext } from "../time.ts";

export { AGENT_TURN_JSON_SCHEMA, parseDecision } from "../action-schema.ts";
export { TIME_ZONE, todayContext };
export { surfaceInputHint };

export function applySurfaceTurnPolicy(input: {
  surface: ChatSurface | null;
  actions: unknown[];
  presentation: AgentPresentation;
  consequence_updates?: unknown;
}): {
  actions: unknown[];
  presentation: AgentPresentation;
  consequence_updates: unknown[];
} {
  const consequence_updates = Array.isArray(input.consequence_updates)
    ? input.consequence_updates
    : [];
  if (input.surface === "schedule") {
    return {
      actions: [],
      presentation:
        input.presentation?.type === "schedule_plan" ? input.presentation : null,
      consequence_updates,
    };
  }
  if (input.surface === "focus" || input.surface === "forgotten") {
    return {
      actions: [],
      presentation:
        input.presentation?.type === "task_list" ? input.presentation : null,
      consequence_updates,
    };
  }
  if (input.surface === "deep-check") {
    return {
      actions: [],
      presentation:
        input.presentation?.type === "insights" ? input.presentation : null,
      consequence_updates,
    };
  }
  if (input.surface === "free-time") {
    return {
      actions: [],
      presentation:
        input.presentation?.type === "task_list" ||
        input.presentation?.type === "task_suggestions"
          ? input.presentation
          : null,
      consequence_updates,
    };
  }
  return {
    actions: input.actions,
    presentation: input.presentation,
    consequence_updates,
  };
}

export function buildInstructions(input: {
  tasks: TaskRow[];
  memory: MemoryRow[];
  shopping?: ShoppingItem[];
  checklists?: Checklist[];
  profile?: AgentProfileContext;
  consequences?: Map<string, ConsequenceRow>;
  surface?: ChatSurface | null;
  surfaceContext?: SurfaceContext | null;
  now?: Date;
  queryHint?: string;
  deepAccessAppendix?: string | null;
}) {
  const consequenceList = input.consequences
    ? [...input.consequences.values()]
    : [];
  const allMemory = Array.isArray(input.memory)
    ? input.memory
    : input.memory
      ? [input.memory]
      : [];
  const compact = buildCompactContext({
    surface: input.surface ?? null,
    surfaceContext: input.surfaceContext ?? null,
    profile: input.profile ?? null,
    currentTime: todayContext(input.now).currentTime,
    queryHint: input.queryHint ?? "",
    allTasks: input.tasks,
    allMemory,
    consequences: consequenceList,
    shopping: input.shopping ?? [],
    checklists: input.checklists ?? [],
  });
  return buildAgentPrompt({
    compact,
    surface: input.surface ?? null,
    surfaceContext: input.surfaceContext ?? null,
    now: input.now,
    deepAccessAppendix: input.deepAccessAppendix,
  }).instructions;
}

export function buildTurnPrompt(input: {
  compact: CompactContext;
  surface?: ChatSurface | null;
  surfaceContext?: SurfaceContext | null;
  now?: Date;
  deepAccessAppendix?: string | null;
}) {
  return buildAgentPrompt(input);
}
