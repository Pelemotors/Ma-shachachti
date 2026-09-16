/** Human-facing memory display + reconcile helpers (no raw JSON to users). */

import type { MemoryKind, MemoryRow } from "./types.ts";
import {
  encodeActionFollowupRelation,
  parseActionFollowupRelation,
} from "./agent/learned-relations.ts";
import { normalizeExactText } from "./task-identity.ts";

export type MemoryCategory =
  | "preference"
  | "habit"
  | "relation"
  | "exception"
  | "fact"
  | "note";

export type MemoryScope = "always" | "temporary";

export type MemoryDisplay = {
  text: string;
  category: MemoryCategory;
  categoryLabel: string;
  scope: MemoryScope;
  scopeLabel: string | null;
};

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  preference: "העדפה",
  habit: "הרגל/קשר",
  relation: "הרגל/קשר",
  exception: "חריגה זמנית",
  fact: "עובדה",
  note: "פרט",
};

export function categoryLabel(category: MemoryCategory): string {
  return CATEGORY_LABELS[category] ?? "פרט";
}

export function inferMemoryCategory(
  content: string,
  kind: MemoryKind,
  explicit?: string | null,
): MemoryCategory {
  if (
    explicit === "preference" ||
    explicit === "habit" ||
    explicit === "relation" ||
    explicit === "exception" ||
    explicit === "fact" ||
    explicit === "note"
  ) {
    return explicit;
  }
  const relation = parseActionFollowupRelation(content);
  if (relation) return "relation";
  if (/מחר|הפעם|רק היום|חריג|זמנית|בפעם הזו/.test(content)) {
    return "exception";
  }
  if (kind === "preference") return "preference";
  if (kind === "fact") return "fact";
  return "note";
}

export function inferMemoryScope(
  content: string,
  category: MemoryCategory,
  explicit?: string | null,
): MemoryScope {
  if (explicit === "temporary" || explicit === "always") return explicit;
  if (category === "exception") return "temporary";
  if (/מחר|הפעם|רק היום|בפעם הזו/.test(content)) return "temporary";
  return "always";
}

/** Format memory content for UI — never show raw JSON. */
export function formatMemoryForDisplay(
  memory: Pick<MemoryRow, "content" | "kind"> & {
    category?: string | null;
    scope?: string | null;
  },
): MemoryDisplay {
  const category = inferMemoryCategory(
    memory.content,
    memory.kind,
    memory.category,
  );
  const scope = inferMemoryScope(memory.content, category, memory.scope);
  const relation = parseActionFollowupRelation(memory.content);
  let text = memory.content.trim();
  if (relation) {
    text =
      relation.ordering === "with"
        ? `כש־«${relation.trigger}» — גם «${relation.followupTitle}»`
        : `אחרי «${relation.trigger}» כדאי גם «${relation.followupTitle}»`;
  } else if (text.startsWith("{") && text.includes("action_followup")) {
    // Broken/partial JSON — hide internals.
    text = "קשר פעולות שנלמד (לא ניתן להציג במלואו — אפשר לערוך או למחוק)";
  }
  return {
    text,
    category,
    categoryLabel: categoryLabel(category),
    scope,
    scopeLabel: scope === "temporary" ? "זמני" : null,
  };
}

export function preferenceTopicKey(content: string): string | null {
  const normalized = normalizeExactText(content);
  if (!normalized) return null;
  // Collapse common laundry/folding preference variants into one topic key.
  const folded = normalized
    .replace(/מעכשיו|מעתה|מהיום|בדרך כלל|תמיד|רק|דווקא|מחר|הפעם|אני|מעדיפה|מעדיף/g, " ")
    .replace(/אקפל|לקפל|קיפול/g, "קיפול")
    .replace(/\s+/g, " ")
    .trim();
  if (folded.includes("קיפול") || folded.includes("כביסה")) {
    return "קיפול-כביסה";
  }
  const match = folded.match(
    /(לנקות|ניקוי|לבשל|בישול|לישון|שינה).{0,40}/,
  );
  if (match) return match[0].slice(0, 80);
  if (folded.length < 8) return null;
  return folded.slice(0, 60);
}

export type MemoryReconcileDecision =
  | { mode: "insert"; category: MemoryCategory; scope: MemoryScope }
  | {
      mode: "update";
      id: string;
      category: MemoryCategory;
      scope: MemoryScope;
      deactivatePrevious?: string;
    }
  | {
      mode: "exception";
      category: "exception";
      scope: "temporary";
      keepStandingId?: string;
    };

/**
 * Decide how a new memory write should land without blind full replace.
 */
export function reconcileMemoryWrite(input: {
  content: string;
  kind: MemoryKind;
  existing: Array<
    Pick<MemoryRow, "id" | "content" | "kind" | "updated_at" | "created_at"> & {
      active?: boolean | null;
      category?: string | null;
      scope?: string | null;
    }
  >;
}): MemoryReconcileDecision {
  const category = inferMemoryCategory(input.content, input.kind);
  const scope = inferMemoryScope(input.content, category);
  const relation = parseActionFollowupRelation(input.content);

  if (relation) {
    const triggerKey = normalizeExactText(relation.trigger);
    const active = input.existing.filter((row) => row.active !== false);
    for (const row of [...active].sort((a, b) =>
      String(b.updated_at ?? b.created_at).localeCompare(
        String(a.updated_at ?? a.created_at),
      ),
    )) {
      const parsed = parseActionFollowupRelation(row.content);
      if (!parsed) continue;
      if (normalizeExactText(parsed.trigger) === triggerKey) {
        return {
          mode: "update",
          id: row.id,
          category: "relation",
          scope: "always",
        };
      }
    }
    return { mode: "insert", category: "relation", scope: "always" };
  }

  if (scope === "temporary" || category === "exception") {
    const topic = preferenceTopicKey(input.content);
    const standing = topic
      ? input.existing.find(
          (row) =>
            row.active !== false &&
            inferMemoryScope(row.content, inferMemoryCategory(row.content, row.kind), row.scope) ===
              "always" &&
            preferenceTopicKey(row.content) === topic,
        )
      : undefined;
    return {
      mode: "exception",
      category: "exception",
      scope: "temporary",
      keepStandingId: standing?.id,
    };
  }

  if (input.kind === "preference" || category === "preference") {
    const topic = preferenceTopicKey(input.content);
    if (topic) {
      const previous = input.existing.find(
        (row) =>
          row.active !== false &&
          (row.kind === "preference" ||
            inferMemoryCategory(row.content, row.kind, row.category) ===
              "preference") &&
          preferenceTopicKey(row.content) === topic &&
          normalizeExactText(row.content) !== normalizeExactText(input.content),
      );
      if (previous) {
        return {
          mode: "update",
          id: previous.id,
          category: "preference",
          scope: "always",
          deactivatePrevious: undefined,
        };
      }
      // Same topic identical text — update in place if exact match exists.
      const exact = input.existing.find(
        (row) =>
          row.active !== false &&
          normalizeExactText(row.content) === normalizeExactText(input.content),
      );
      if (exact) {
        return {
          mode: "update",
          id: exact.id,
          category: "preference",
          scope: "always",
        };
      }
    }
  }

  // Permanent preference change markers — supersede prior standing preference.
  if (/מעכשיו|מעתה|מהיום/.test(input.content)) {
    const topic = preferenceTopicKey(input.content);
    const previous = topic
      ? input.existing.find(
          (row) =>
            row.active !== false &&
            preferenceTopicKey(row.content) === topic &&
            normalizeExactText(row.content) !==
              normalizeExactText(input.content),
        )
      : undefined;
    if (previous) {
      return {
        mode: "insert",
        category: "preference",
        scope: "always",
      };
    }
  }

  return { mode: "insert", category, scope };
}

/** Encode relation edit from human fields back to storage content. */
export function encodeHumanRelation(trigger: string, followup: string): string {
  return encodeActionFollowupRelation({ trigger, followup });
}
