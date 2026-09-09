import type { AppState, Task } from "@/lib/model";
import { classifyTaskDuplicate } from "./dedupe";

export type DuplicateAuditRow = {
  kind: "exact" | "canonical" | "duplicate_id" | "broken_reference";
  taskIds: string[];
};

/** Read-only technical audit. Does not merge or delete. */
export function auditTaskDuplicates(state: AppState): DuplicateAuditRow[] {
  const rows: DuplicateAuditRow[] = [];
  const seen = new Map<string, Task>();
  for (const task of state.tasks) {
    const existing = seen.get(task.id);
    if (existing) {
      rows.push({ kind: "duplicate_id", taskIds: [existing.id, task.id] });
    } else {
      seen.set(task.id, task);
    }
    for (const dep of task.dependsOn) {
      if (!seen.has(dep) && !state.tasks.some((row) => row.id === dep)) {
        rows.push({ kind: "broken_reference", taskIds: [task.id, dep] });
      }
    }
    if (task.status !== "open" && task.status !== "in_progress") continue;
    const match = classifyTaskDuplicate(state, {
      title: task.title,
      kind: task.kind,
      categoryId: task.categoryId,
      detailTypeId: task.detailTypeId,
      templateId: task.templateId,
      dueAt: task.dueAt,
      homeAreaIds: task.homeAreaIds,
      relatedMemberIds: task.relatedMemberIds,
    });
    if (
      (match.confidence === "exact" || match.confidence === "canonical") &&
      match.task.id !== task.id
    ) {
      rows.push({
        kind: match.confidence,
        taskIds: [match.task.id, task.id],
      });
    }
  }
  return rows;
}
