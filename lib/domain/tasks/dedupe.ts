import type { AppState, Task } from "@/lib/model";
import { normalize } from "@/lib/model";

export type TaskCreateLike = {
  title: string;
  kind?: Task["kind"];
  categoryId?: string;
  detailTypeId?: string | null;
  templateId?: string | null;
  dueAt?: string | null;
  homeAreaIds?: string[];
  relatedMemberIds?: string[];
};

export type TaskDedupeMatch =
  | { confidence: "canonical" | "exact"; task: Task }
  | { confidence: "similar"; task: Task }
  | { confidence: "none" };

function isActiveOpen(t: Task) {
  return (
    t.status === "open" ||
    t.status === "in_progress" ||
    t.status === "unknown"
  );
}

/**
 * Shared task dedupe for chat proposals and engine persistence.
 * High confidence (canonical/exact) may silent-skip create.
 * Similar is preview-only — never silent-drop without user awareness.
 */
export function classifyTaskDuplicate(
  state: AppState,
  input: TaskCreateLike,
): TaskDedupeMatch {
  const kind = input.kind ?? "task";
  const dueAt = input.dueAt ?? null;
  const title = normalize(input.title);
  const active = state.tasks.filter(isActiveOpen);

  if (input.templateId) {
    const byTemplate = active.find(
      (t) =>
        t.templateId === input.templateId &&
        t.kind === kind &&
        t.dueAt === dueAt,
    );
    if (byTemplate) return { confidence: "canonical", task: byTemplate };
  }

  if (input.detailTypeId && input.categoryId) {
    const byDetail = active.find(
      (t) =>
        t.detailTypeId === input.detailTypeId &&
        t.categoryId === input.categoryId &&
        t.kind === kind &&
        t.dueAt === dueAt,
    );
    if (byDetail) return { confidence: "canonical", task: byDetail };
  }

  const exact = active.find(
    (t) =>
      normalize(t.title) === title && t.kind === kind && t.dueAt === dueAt,
  );
  if (exact) return { confidence: "exact", task: exact };

  // Soft signal for Preview only — not silent merge (no keyword dictionaries).
  const similar = active.find((t) => {
    if (input.categoryId && t.categoryId !== input.categoryId) return false;
    if (dueAt !== t.dueAt) return false;
    if (kind !== t.kind) return false;
    const hay = normalize(t.title);
    if (hay === title) return true;
    if (hay.includes(title) || title.includes(hay)) return true;
    return false;
  });
  if (similar) return { confidence: "similar", task: similar };

  return { confidence: "none" };
}

export function isHardDuplicate(match: TaskDedupeMatch): boolean {
  return match.confidence === "canonical" || match.confidence === "exact";
}
