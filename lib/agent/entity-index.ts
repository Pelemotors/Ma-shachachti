/**
 * Structural inventory of AppState for the agent.
 * Counts / open-active status / IDs only — never message meaning.
 */
import type { AppState } from "@/lib/model";
import { dayKey } from "@/lib/time";
import { activeFacts } from "@/lib/engine";
import { planForDate, planningPlans } from "@/lib/domain/planning/plans";
import { checklistIndexEntry } from "@/lib/domain/checklists";

const OPEN_TASK = new Set(["open", "unknown", "in_progress"]);

export type AgentEntityIndex = {
  localDateKey: string;
  tasks: {
    total: number;
    open: number;
    openIds: string[];
    hasMoreOpen: boolean;
  };
  reminders: { total: number; pending: number; pendingIds: string[] };
  routines: { total: number; active: number; activeIds: string[] };
  shopping: { total: number; open: number; purchased: number };
  plans: {
    hasTodayPlan: boolean;
    plannedTaskCount: number;
    storedDateCount: number;
  };
  home: { areaCount: number; firstScanStatus: string | null };
  memory: { factCount: number; compactedFactCount: number };
  forecasts: { learningCount: number; forecastKindCount: number };
  checklists: { tasksWithSteps: number; openStepCount: number };
  personalChecklists: {
    total: number;
    entries: { id: string; title: string; itemCount: number; updatedAt: string }[];
  };
  processes: { operationCount: number };
  workingMemory: {
    present: boolean;
    openLoopCount: number;
    referencedEntityCount: number;
  };
  messages: { total: number };
};

/** Build a read-only structural index. Independent of the user message text. */
export function buildEntityIndex(
  state: AppState,
  now: Date = new Date(),
): AgentEntityIndex {
  const tz = state.profile.timezone;
  const openTasks = state.tasks.filter((t) => OPEN_TASK.has(t.status));
  const pendingReminders = state.reminders.filter((r) => r.status === "pending");
  const activeRoutines = state.routines.filter((r) => r.status === "active");
  const openShopping = state.shopping.filter((s) => !s.purchasedAt);
  const plan = planForDate(state, dayKey(now, tz));
  const facts = activeFacts(state, now);
  const tasksWithSteps = state.tasks.filter((t) => (t.steps?.length ?? 0) > 0);
  const openStepCount = state.tasks.reduce(
    (n, t) => n + (t.steps?.filter((s) => !s.done).length ?? 0),
    0,
  );
  const forecastKindCount = state.learning.filter(
    (l) => l.kind === "forecast",
  ).length;
  const wm = state.agentWorkingMemory;

  return {
    localDateKey: dayKey(now, tz),
    tasks: {
      total: state.tasks.length,
      open: openTasks.length,
      openIds: openTasks.slice(0, 80).map((t) => t.id),
      hasMoreOpen: openTasks.length > 80,
    },
    reminders: {
      total: state.reminders.length,
      pending: pendingReminders.length,
      pendingIds: pendingReminders.slice(0, 80).map((r) => r.id),
    },
    routines: {
      total: state.routines.length,
      active: activeRoutines.length,
      activeIds: activeRoutines.slice(0, 80).map((r) => r.id),
    },
    shopping: {
      total: state.shopping.length,
      open: openShopping.length,
      purchased: state.shopping.length - openShopping.length,
    },
    plans: {
      hasTodayPlan: Boolean(plan),
      plannedTaskCount: plan?.items.length ?? 0,
      storedDateCount: Object.keys(planningPlans(state)).length,
    },
    home: {
      areaCount: state.homeAreas.length,
      firstScanStatus: state.firstScan?.status ?? null,
    },
    memory: {
      factCount: facts.length,
      compactedFactCount: state.compactedMemory.facts.length,
    },
    forecasts: {
      learningCount: state.learning.length,
      forecastKindCount,
    },
    checklists: {
      tasksWithSteps: tasksWithSteps.length,
      openStepCount,
    },
    personalChecklists: {
      total: state.checklists.length,
      entries: state.checklists
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 100)
        .map(checklistIndexEntry),
    },
    processes: {
      operationCount: state.operations.length,
    },
    workingMemory: {
      present: Boolean(wm),
      openLoopCount: wm?.openLoops.length ?? 0,
      referencedEntityCount: wm?.relevantEntityIds.length ?? 0,
    },
    messages: { total: state.messages.length },
  };
}

/** Stable fingerprint of structural context selection (not message text). */
export function structuralContextFingerprint(input: {
  entityIndex: AgentEntityIndex;
  contextDomains: string[];
  referencedEntityIds: string[];
  pendingProposalId: string | null;
  stateRevision: number;
  localDateKey: string;
}): string {
  return JSON.stringify({
    stateRevision: input.stateRevision,
    localDateKey: input.localDateKey,
    domains: [...input.contextDomains].sort(),
    entityIndex: input.entityIndex,
    refs: [...input.referencedEntityIds].sort(),
    pending: input.pendingProposalId,
  });
}
