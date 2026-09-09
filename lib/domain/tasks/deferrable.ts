import type { AppState, Task } from "@/lib/model";
import { isActiveVisibleTask } from "@/lib/domain/tasks/visibility";
import { activeDailyPlan } from "@/lib/engine";
import { msUntil } from "@/lib/time";

export type DeferrableCandidate = {
  taskId: string;
  title: string;
  priority: number;
  reason: string;
  caution?: "overdue" | "urgent_deadline" | null;
};

export type ProtectedTask = {
  taskId: string;
  title: string;
  reason: string;
};

/**
 * Domain separates legality from judgment.
 *
 * In-progress and locked plan items are hard-protected because deferring them
 * would violate active execution state. Deadlines/priority remain context for
 * the personal agent, not a deterministic veto on explicit user intent.
 */
export function getDeferrableCandidates(
  state: AppState,
  now: Date = new Date(),
): {
  candidates: DeferrableCandidate[];
  protected: ProtectedTask[];
} {
  const plan = activeDailyPlan(state);
  const locked = new Set(
    plan?.items.filter((i) => i.locked).map((i) => i.taskId) ?? [],
  );
  const requestedToday = new Set(plan?.items.map((i) => i.taskId) ?? []);
  const candidates: DeferrableCandidate[] = [];
  const protectedTasks: ProtectedTask[] = [];

  for (const t of state.tasks) {
    if (!isActiveVisibleTask(t, now)) continue;
    const block = protectedReason(t, locked);
    if (block) {
      protectedTasks.push({ taskId: t.id, title: t.title, reason: block });
      continue;
    }
    candidates.push({
      taskId: t.id,
      title: t.title,
      priority: t.priority,
      reason: deferReason(t, requestedToday.has(t.id)),
      caution: deadlineCaution(t, now),
    });
  }

  // Stable presentation only. The LLM decides human relevance among legal options.
  candidates.sort((a, b) => a.priority - b.priority);
  return { candidates, protected: protectedTasks };
}

function protectedReason(t: Task, locked: Set<string>): string | null {
  if (t.status === "in_progress") return "in_progress";
  if (locked.has(t.id)) return "locked";
  return null;
}

function deadlineCaution(
  t: Task,
  now: Date,
): "overdue" | "urgent_deadline" | null {
  if (!t.dueAt) return null;
  if (Date.parse(t.dueAt) < now.getTime()) return "overdue";
  if (t.priority >= 3 && msUntil(t.dueAt, now) < 36 * 3600000)
    return "urgent_deadline";
  return null;
}

function deferReason(t: Task, inPlan: boolean): string {
  if (t.priority <= 1) return "low_priority";
  if (!t.dueAt) return "no_hard_deadline";
  if (inPlan) return "planned_but_flexible";
  return "flexible";
}

/** Domain gate: reject only truly protected defer actions. */
export function filterSafeDeferActions(
  state: AppState,
  actions: { type: string; id?: string }[],
  now: Date = new Date(),
) {
  const { candidates, protected: protectedTasks } = getDeferrableCandidates(
    state,
    now,
  );
  const allowed = new Set(candidates.map((c) => c.taskId));
  const accepted: typeof actions = [];
  const rejected: { action: (typeof actions)[number]; reason: string }[] = [];
  for (const a of actions) {
    if (a.type !== "task.defer" && a.type !== "task.deferUntil") {
      accepted.push(a);
      continue;
    }
    const id = a.id;
    if (!id || !allowed.has(id)) {
      const prot = protectedTasks.find((p) => p.taskId === id);
      rejected.push({ action: a, reason: prot?.reason ?? "not_deferrable" });
      continue;
    }
    accepted.push(a);
  }
  return { accepted, rejected, candidates, protected: protectedTasks };
}
