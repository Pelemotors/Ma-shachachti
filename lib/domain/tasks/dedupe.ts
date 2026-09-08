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
  /** Explicit "שוב / עוד פעם" — allow new occurrence even if similar active exists. */
  forceNewOccurrence?: boolean;
};

export type TaskDedupeMatch =
  | { confidence: "canonical" | "exact"; task: Task }
  | { confidence: "similar"; task: Task; suggestDueAtUpdate?: boolean }
  | { confidence: "none" };

function isActiveOpen(t: Task) {
  return (
    t.status === "open" || t.status === "in_progress" || t.status === "unknown"
  );
}

function sameMembers(a?: string[], b?: string[]) {
  const left = [...(a ?? [])].sort().join(",");
  const right = [...(b ?? [])].sort().join(",");
  return left === right;
}

function sameAreas(a?: string[], b?: string[]) {
  const left = [...(a ?? [])].sort().join(",");
  const right = [...(b ?? [])].sort().join(",");
  return left === right;
}

/**
 * Shared task dedupe. dueAt is metadata — not absolute identity.
 * Same active task + new dueAt → similar (preview update), not silent create.
 */
export function classifyTaskDuplicate(
  state: AppState,
  input: TaskCreateLike,
): TaskDedupeMatch {
  if (input.forceNewOccurrence) return { confidence: "none" };

  const kind = input.kind ?? "task";
  const dueAt = input.dueAt ?? null;
  const title = normalize(input.title);
  const active = state.tasks.filter(isActiveOpen);

  if (input.templateId) {
    const byTemplate = active.find(
      (t) =>
        t.templateId === input.templateId &&
        t.kind === kind &&
        sameMembers(t.relatedMemberIds, input.relatedMemberIds) &&
        sameAreas(t.homeAreaIds, input.homeAreaIds),
    );
    if (byTemplate) {
      if (byTemplate.dueAt === dueAt)
        return { confidence: "canonical", task: byTemplate };
      return {
        confidence: "similar",
        task: byTemplate,
        suggestDueAtUpdate: dueAt != null && byTemplate.dueAt !== dueAt,
      };
    }
  }

  if (input.detailTypeId && input.categoryId) {
    const byDetail = active.find(
      (t) =>
        t.detailTypeId === input.detailTypeId &&
        t.categoryId === input.categoryId &&
        t.kind === kind &&
        sameMembers(t.relatedMemberIds, input.relatedMemberIds) &&
        sameAreas(t.homeAreaIds, input.homeAreaIds),
    );
    if (byDetail) {
      if (byDetail.dueAt === dueAt)
        return { confidence: "canonical", task: byDetail };
      return {
        confidence: "similar",
        task: byDetail,
        suggestDueAtUpdate: dueAt != null && byDetail.dueAt !== dueAt,
      };
    }
  }

  const exact = active.find(
    (t) =>
      normalize(t.title) === title &&
      t.kind === kind &&
      sameMembers(t.relatedMemberIds, input.relatedMemberIds) &&
      sameAreas(t.homeAreaIds, input.homeAreaIds),
  );
  if (exact) {
    if (exact.dueAt === dueAt) return { confidence: "exact", task: exact };
    return {
      confidence: "similar",
      task: exact,
      suggestDueAtUpdate: dueAt != null && exact.dueAt !== dueAt,
    };
  }

  const similar = active.find((t) => {
    if (input.categoryId && t.categoryId !== input.categoryId) return false;
    if (kind !== t.kind) return false;
    const hay = normalize(t.title);
    if (hay === title) return true;
    if (hay.includes(title) || title.includes(hay)) return true;
    return false;
  });
  if (similar)
    return {
      confidence: "similar",
      task: similar,
      suggestDueAtUpdate: Boolean(dueAt && similar.dueAt !== dueAt),
    };

  return { confidence: "none" };
}

export function isHardDuplicate(match: TaskDedupeMatch): boolean {
  return match.confidence === "canonical" || match.confidence === "exact";
}
