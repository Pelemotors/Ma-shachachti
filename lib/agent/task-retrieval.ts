import type { AppState, Task } from "@/lib/model";

export type TaskRetrievalQuery = {
  status?: string[];
  limit?: number;
  since?: string;
  cursor?: string;
  before?: string;
  after?: string;
  compact?: boolean;
  text?: string;
};

export type CompactTaskRecord = {
  id: string;
  title: string;
  status: Task["status"];
  deadline: Task["deadline"];
  updatedAt: string;
};

export type FullTaskListRecord = CompactTaskRecord & {
  dueAt: Task["dueAt"];
  priority: Task["priority"];
  categoryId: Task["categoryId"];
  completedAt: Task["completedAt"];
};

export type TaskRetrievalPage = {
  items: CompactTaskRecord[] | FullTaskListRecord[];
  nextCursor: string | null;
  hasMore: boolean;
  totalMatched: number;
  compact: boolean;
};

function normalizeHaystack(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function matchesText(task: Task, text: string) {
  const q = normalizeHaystack(text);
  if (!q) return true;
  return (
    normalizeHaystack(task.title).includes(q) ||
    normalizeHaystack(task.notes ?? "").includes(q)
  );
}

function inDateWindow(iso: string | null | undefined, query: TaskRetrievalQuery) {
  if (!iso) return !query.since && !query.before && !query.after;
  if (query.since && iso < query.since) return false;
  if (query.after && iso < query.after) return false;
  if (query.before && iso > query.before) return false;
  return true;
}

function sortNewestFirst(a: Task, b: Task) {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

function toCompact(task: Task): CompactTaskRecord {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    deadline: task.deadline ?? null,
    updatedAt: task.updatedAt,
  };
}

function toFull(task: Task): FullTaskListRecord {
  return {
    ...toCompact(task),
    dueAt: task.dueAt,
    priority: task.priority,
    categoryId: task.categoryId,
    completedAt: task.completedAt,
  };
}

/**
 * Mechanical task retrieval: filter, paginate, optional containment search.
 * The caller (Agent) chooses the query. Code does not rank meaning.
 */
export function retrieveTasks(
  state: AppState,
  query: TaskRetrievalQuery = {},
): TaskRetrievalPage {
  const limit = Math.min(Math.max(query.limit ?? 40, 1), 100);
  const compact = Boolean(query.compact);
  let tasks = state.tasks.slice();
  if (query.status?.length) {
    const allowed = new Set(query.status);
    tasks = tasks.filter((task) => allowed.has(task.status));
  }
  if (query.text?.trim()) {
    tasks = tasks.filter((task) => matchesText(task, query.text!));
  }
  tasks = tasks.filter((task) => inDateWindow(task.updatedAt, query));
  tasks.sort(sortNewestFirst);

  let start = 0;
  if (query.cursor) {
    const idx = tasks.findIndex((task) => task.id === query.cursor);
    start = idx >= 0 ? idx + 1 : tasks.length;
  }

  const page = tasks.slice(start, start + limit);
  const hasMore = start + page.length < tasks.length;
  return {
    items: compact ? page.map(toCompact) : page.map(toFull),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    hasMore,
    totalMatched: tasks.length,
    compact,
  };
}
