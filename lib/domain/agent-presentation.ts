import type { AppState } from "@/lib/model";

export type AgentPresentation = {
  taskIds: string[];
};

const DISPLAYABLE = new Set(["open", "unknown", "in_progress"]);

/**
 * Mechanical presentation filter. Does not rank or interpret meaning.
 * Invalid / missing / completed / cancelled IDs are dropped.
 */
export function sanitizePresentation(
  state: AppState,
  raw: { taskIds?: unknown } | null | undefined,
): AgentPresentation {
  const seen = new Set<string>();
  const taskIds: string[] = [];
  const incoming = Array.isArray(raw?.taskIds) ? raw.taskIds : [];
  const byId = new Map(state.tasks.map((task) => [task.id, task]));
  for (const id of incoming) {
    if (typeof id !== "string" || !id || seen.has(id)) continue;
    const task = byId.get(id);
    if (!task || !DISPLAYABLE.has(task.status)) continue;
    seen.add(id);
    taskIds.push(id);
    if (taskIds.length >= 40) break;
  }
  return { taskIds };
}

export function mergePresentedEntityIds(
  current: string[] | undefined,
  presented: string[],
): string[] {
  return [...new Set([...(current ?? []), ...presented])].slice(0, 40);
}
