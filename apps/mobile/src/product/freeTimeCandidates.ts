import type { MobilePlanItem } from "../api/planning";
import type { MobileRoutine } from "../api/routines";
import type { MobileTask } from "../api/tasks";

export type FreeTimeEnergy = "low" | "medium" | "high";

export type FreeTimeCandidate = MobileTask & {
  reason: string;
};

function deadlineDistance(task: MobileTask, date: string) {
  if (!task.due_on) return Number.POSITIVE_INFINITY;
  return (Date.parse(`${task.due_on}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86_400_000;
}

/**
 * Free Time is a read-only candidate query. It deliberately does not call the
 * planner and excludes work that is already represented by today's plan.
 */
export function selectFreeTimeCandidates(input: {
  tasks: MobileTask[];
  planItems: MobilePlanItem[];
  routines: MobileRoutine[];
  date: string;
  minutes: number;
  energy?: FreeTimeEnergy | null;
  offset?: number;
  limit?: number;
}): FreeTimeCandidate[] {
  const routineTaskIds = new Set(
    input.routines.filter((routine) => routine.active).map((routine) => routine.task_id),
  );
  const plannedTaskIds = new Set(input.planItems.map((item) => item.task_id));
  const tomorrow = new Date(`${input.date}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowDate = tomorrow.toISOString().slice(0, 10);

  const candidates = input.tasks
    .filter((task) => task.status === "open")
    .filter((task) => !routineTaskIds.has(task.id))
    .filter((task) => !plannedTaskIds.has(task.id))
    // Near-term attention work belongs to the forgotten/urgent flow, not free time.
    .filter((task) => !task.due_on || task.due_on > tomorrowDate)
    .filter((task) => !task.estimate_minutes || task.estimate_minutes <= input.minutes)
    .map((task) => {
      const distance = deadlineDistance(task, input.date);
      let score = 0;
      if (!task.due_on) score += 5;
      else if (distance >= 60) score += 4;
      else if (distance >= 14) score += 3;
      else score += 1;
      score += Math.min(4, task.reschedule_count ?? 0);
      if (input.energy === "low" && (task.estimate_minutes ?? input.minutes) <= input.minutes / 2) score += 2;
      if (input.energy === "high" && (task.estimate_minutes ?? 0) >= input.minutes / 2) score += 1;
      return { task, score };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return (left.task.created_at ?? "").localeCompare(right.task.created_at ?? "") || left.task.id.localeCompare(right.task.id);
    });

  const limit = input.limit ?? 3;
  const start = candidates.length ? (input.offset ?? 0) % candidates.length : 0;
  const rotated = candidates.length
    ? [...candidates.slice(start), ...candidates.slice(0, start)]
    : [];
  return rotated.slice(0, Math.min(limit, candidates.length)).map(({ task }) => ({
    ...task,
    reason: task.due_on ? "מתאים לזמן הפנוי ולמועד הרחוק" : "משימה ללא דדליין",
  }));
}
