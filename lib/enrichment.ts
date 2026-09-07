import { classifyLegacyCategory, CategoryId } from "./taxonomy";
import { catalog } from "./catalog";
import { normalize } from "./model";

export type EnrichmentResult = {
  categoryId: CategoryId;
  detailTypeId: string | null;
  workMinutes?: number;
  waitMinutes?: number;
  effort?: number;
  priority?: number;
  kind?: "task" | "idea";
};

/**
 * Deterministic enrichment fallback (no network). Explicit user fields win at apply-time.
 */
export function enrichTaskLocal(input: {
  title: string;
  categoryId?: CategoryId;
  detailTypeId?: string | null;
  workMinutes?: number;
  waitMinutes?: number;
  effort?: number;
  priority?: number;
  kind?: "task" | "idea";
  templateId?: string | null;
}): EnrichmentResult {
  if (input.categoryId && input.categoryId !== "unclassified") {
    return {
      categoryId: input.categoryId,
      detailTypeId: input.detailTypeId ?? null,
      workMinutes: input.workMinutes,
      waitMinutes: input.waitMinutes,
      effort: input.effort,
      priority: input.priority,
      kind: input.kind,
    };
  }
  const hit = catalog.find(
    (c) =>
      c.id === input.templateId ||
      normalize(c.title) === normalize(input.title),
  );
  if (hit) {
    return {
      categoryId: hit.categoryId,
      detailTypeId: hit.detailTypeId,
      workMinutes: input.workMinutes ?? hit.workMinutes,
      waitMinutes: input.waitMinutes ?? hit.waitMinutes,
      effort: input.effort ?? hit.effort,
      priority: input.priority,
      kind: input.kind ?? "task",
    };
  }
  return {
    categoryId: classifyLegacyCategory(
      "שונות / לא מסווג",
      input.title,
      input.templateId,
    ),
    detailTypeId: input.detailTypeId ?? null,
    workMinutes: input.workMinutes,
    waitMinutes: input.waitMinutes,
    effort: input.effort,
    priority: input.priority ?? 1,
    kind: input.kind ?? "task",
  };
}
