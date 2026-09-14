import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsequenceRow, MemoryRow, TaskRow } from "../../types.ts";
import type { Checklist, ShoppingItem } from "../../lists.ts";
import { loadMemory, loadTasks } from "../../actions.ts";
import { loadConsequences } from "../../consequences.ts";
import { loadChecklists, loadShopping } from "../../lists.ts";
import { dueTimeFromDueAt, jerusalemParts } from "../../time.ts";

export const CONTEXT_REQUEST_ENTITIES = [
  "tasks",
  "memories",
  "shopping",
  "checklists",
  "consequences",
] as const;
export type ContextRequestEntity = (typeof CONTEXT_REQUEST_ENTITIES)[number];

export type ContextRequest = {
  entity: ContextRequestEntity;
  query: string | null;
  limit: number | null;
};

function isEntity(value: unknown): value is ContextRequestEntity {
  return (
    typeof value === "string" &&
    (CONTEXT_REQUEST_ENTITIES as readonly string[]).includes(value)
  );
}

export function parseContextRequests(value: unknown): ContextRequest[] {
  if (!Array.isArray(value)) return [];
  const out: ContextRequest[] = [];
  const seen = new Set<string>();
  for (const row of value.slice(0, 4)) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const raw = row as Record<string, unknown>;
    if (!isEntity(raw.entity)) continue;
    const query =
      typeof raw.query === "string" && raw.query.trim()
        ? raw.query.trim().slice(0, 120)
        : null;
    const limit =
      typeof raw.limit === "number" &&
      Number.isInteger(raw.limit) &&
      raw.limit >= 1 &&
      raw.limit <= 50
        ? raw.limit
        : null;
    const key = `${raw.entity}:${query ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ entity: raw.entity, query, limit });
  }
  return out;
}

function matchQuery(haystack: string, query: string | null) {
  if (!query) return true;
  const tokens = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2);
  if (!tokens.length) return true;
  const lower = haystack.toLowerCase();
  return tokens.some((token) => lower.includes(token));
}

function formatTask(task: TaskRow, consequence?: ConsequenceRow) {
  const clock = dueTimeFromDueAt(task.due_at);
  const due = task.due_on ? ` due ${task.due_on}` : "";
  const time = clock ? ` at ${clock}` : "";
  const planned = task.planned_start_at
    ? ` planned ${jerusalemParts(task.planned_start_at).date} ${jerusalemParts(task.planned_start_at).time}`
    : "";
  const consequenceText = consequence
    ? ` consequence=${consequence.severity}`
    : "";
  return `- ${task.id} [${task.status}] ${task.title}${due}${time}${planned}${consequenceText}`;
}

export async function fulfillContextRequests(input: {
  db: SupabaseClient;
  userId: string;
  requests: ContextRequest[];
  alreadyTaskIds?: Set<string>;
  alreadyMemoryIds?: Set<string>;
}): Promise<string> {
  if (!input.requests.length) return "";
  const blocks: string[] = [];

  for (const request of input.requests) {
    const limit = request.limit ?? (request.entity === "memories" ? 20 : 30);
    if (request.entity === "tasks") {
      const tasks = await loadTasks(input.db, input.userId);
      const filtered = tasks
        .filter((task) => !input.alreadyTaskIds?.has(task.id))
        .filter((task) =>
          matchQuery(`${task.title} ${task.notes}`, request.query),
        )
        .slice(0, limit);
      blocks.push(
        `### tasks (${filtered.length})\n${
          filtered.length
            ? filtered.map((task) => formatTask(task)).join("\n")
            : "- אין"
        }`,
      );
      continue;
    }
    if (request.entity === "memories") {
      const memories = await loadMemory(input.db, input.userId);
      const filtered = memories
        .filter((row) => !input.alreadyMemoryIds?.has(row.id))
        .filter((row) => matchQuery(row.content, request.query))
        .slice(0, limit);
      blocks.push(
        `### memories (${filtered.length})\n${
          filtered.length
            ? filtered
                .map(
                  (row) =>
                    `- ${row.id} [${row.kind}/${row.source}] ${row.content}`,
                )
                .join("\n")
            : "- אין"
        }`,
      );
      continue;
    }
    if (request.entity === "shopping") {
      const shopping = await loadShopping(input.db, input.userId);
      const filtered = shopping
        .filter((item) => matchQuery(item.title, request.query))
        .slice(0, limit);
      blocks.push(
        `### shopping (${filtered.length})\n${
          filtered.length
            ? filtered
                .map(
                  (item) =>
                    `- ${item.id} ${item.title} x${item.quantity}${item.purchased_at ? " [bought]" : ""}`,
                )
                .join("\n")
            : "- אין"
        }`,
      );
      continue;
    }
    if (request.entity === "checklists") {
      const checklists = await loadChecklists(input.db, input.userId);
      const filtered = checklists
        .filter((list) =>
          matchQuery(
            `${list.title} ${list.items.map((i) => i.text).join(" ")}`,
            request.query,
          ),
        )
        .slice(0, Math.min(limit, 12));
      blocks.push(
        `### checklists (${filtered.length})\n${
          filtered.length
            ? filtered
                .map((list) => {
                  const items = list.items
                    .slice(0, 20)
                    .map(
                      (item) =>
                        `  - ${item.id} ${item.checked ? "[x]" : "[ ]"} ${item.text}`,
                    )
                    .join("\n");
                  return `- ${list.id} ${list.title}\n${items}`;
                })
                .join("\n")
            : "- אין"
        }`,
      );
      continue;
    }
    if (request.entity === "consequences") {
      const tasks = await loadTasks(input.db, input.userId);
      const openIds = tasks
        .filter((task) => task.status === "open")
        .map((task) => task.id);
      const consequenceMap = await loadConsequences(
        input.db,
        input.userId,
        openIds,
      );
      const filtered = [...consequenceMap.values()]
        .filter((row) =>
          matchQuery(`${row.reason} ${row.severity}`, request.query),
        )
        .slice(0, limit);
      blocks.push(
        `### consequences (${filtered.length})\n${
          filtered.length
            ? filtered
                .map(
                  (row) =>
                    `- ${row.task_id} severity=${row.severity} ${row.reason}`,
                )
                .join("\n")
            : "- אין"
        }`,
      );
    }
  }

  return blocks.join("\n\n");
}

export type DeepAccessTelemetry = {
  requested: boolean;
  fulfilled: boolean;
  entities: ContextRequestEntity[];
};
