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

/** Unwrap agent_memory JSON envelopes so temporal rules see the human text. */
function memoryPlainText(content: string): string {
  const raw = content.trim();
  if (!raw.startsWith("{")) return raw;
  try {
    const parsed = JSON.parse(raw) as { text?: unknown };
    if (typeof parsed.text === "string" && parsed.text.trim()) {
      return parsed.text.trim();
    }
  } catch {
    /* keep raw */
  }
  return raw;
}

/** Day/event-scoped wording → temporary unless an explicit durable routine/preference. */
const DAY_SCOPED_RE =
  /(?:^|[\s,."״])(?:היום|מחר|הערב|הלילה|השבוע|כרגע|הפעם|רק\s+היום|בפעם\s+הזו|חריג|זמנית)(?:$|[\s,."״])/;

const DURABLE_ROUTINE_RE =
  /בימי\s+\S+|כל\s+(?:יום|בוקר|ערב|שבוע)|תמיד|בדרך\s+כלל|מעולם|אני\s+לא\s+אוהב|אני\s+לא\s+אוהבת|אנחנו\s+לא\s+\S+\s+ב/;

export function isDayScopedTemporalContent(content: string): boolean {
  const text = memoryPlainText(content);
  if (!text) return false;
  if (DURABLE_ROUTINE_RE.test(text)) return false;
  return (
    DAY_SCOPED_RE.test(text) ||
    /מחר|הפעם|רק היום|בפעם הזו|חריג|זמנית/.test(text)
  );
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
    // Day-scoped facts must not stay durable "fact/note" just because the model set category.
    if (
      (explicit === "fact" || explicit === "note" || explicit === "preference") &&
      isDayScopedTemporalContent(content) &&
      !DURABLE_ROUTINE_RE.test(memoryPlainText(content))
    ) {
      return "exception";
    }
    return explicit;
  }
  const relation = parseActionFollowupRelation(content);
  if (relation) return "relation";
  if (isDayScopedTemporalContent(content)) {
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
  if (explicit === "temporary" || explicit === "always") {
    if (
      explicit === "always" &&
      isDayScopedTemporalContent(content) &&
      !DURABLE_ROUTINE_RE.test(memoryPlainText(content))
    ) {
      return "temporary";
    }
    return explicit;
  }
  if (category === "exception") return "temporary";
  if (isDayScopedTemporalContent(content)) return "temporary";
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
  if (/אל תעמיס|מה שחייב|לו״ז קל|לוז קל/.test(folded)) {
    return "יום-קל-עומס";
  }
  const match = folded.match(
    /(לנקות|ניקוי|לבשל|בישול|לישון|שינה).{0,40}/,
  );
  if (match) return match[0].slice(0, 80);
  if (folded.length < 8) return null;
  return folded.slice(0, 60);
}

/** Stable entity key for household/domain facts so corrections can supersede. */
export function factEntityKey(content: string): string | null {
  const normalized = normalizeExactText(content).toLowerCase();
  if (!normalized) return null;
  // Child health/logistics: key by child + topic so adult corrections supersede.
  if (
    normalized.includes("תום") &&
    /רופא|גן|מרגיש|חוזר|לוקח|לוקחת|נשאר/.test(normalized)
  ) {
    return "תום:טיפול-ילד";
  }
  if (/חשמלאי/.test(normalized)) return "חשמלאי:תיקון";
  if (/כלב|צארלי|צ׳ארלי|אוכל לצ/.test(normalized)) return "צארלי:חיית-מחמד";
  const entities = ["תום", "דני", "מאיה", "עידו", "צארלי", "צ׳ארלי"];
  const hits = entities.filter((name) => normalized.includes(name));
  if (!hits.length) return null;
  return `${hits.sort().join("+")}:כללי`;
}

export type MemoryReconcileDecision =
  | { mode: "insert"; category: MemoryCategory; scope: MemoryScope; supersedes?: string }
  | {
      mode: "update";
      id: string;
      category: MemoryCategory;
      scope: MemoryScope;
      deactivatePrevious?: string;
      supersedes?: string;
    }
  | {
      mode: "exception";
      category: "exception";
      scope: "temporary";
      keepStandingId?: string;
      deactivateIds?: string[];
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
    const entity = factEntityKey(input.content);
    const standing = topic
      ? input.existing.find(
          (row) =>
            row.active !== false &&
            inferMemoryScope(row.content, inferMemoryCategory(row.content, row.kind), row.scope) ===
              "always" &&
            preferenceTopicKey(row.content) === topic,
        )
      : undefined;
    const staleFacts = entity
      ? input.existing
          .filter(
            (row) =>
              row.active !== false &&
              factEntityKey(row.content) === entity &&
              normalizeExactText(row.content) !==
                normalizeExactText(input.content),
          )
          .map((row) => row.id)
      : [];
    return {
      mode: "exception",
      category: "exception",
      scope: "temporary",
      keepStandingId: standing?.id,
      deactivateIds: staleFacts,
    };
  }

  if (input.kind === "fact" || category === "fact") {
    const entity = factEntityKey(input.content);
    if (entity) {
      const previous = input.existing.find(
        (row) =>
          row.active !== false &&
          factEntityKey(row.content) === entity &&
          normalizeExactText(row.content) !== normalizeExactText(input.content),
      );
      if (previous) {
        return {
          mode: "update",
          id: previous.id,
          category: "fact",
          scope: "always",
          supersedes: previous.id,
        };
      }
      const exact = input.existing.find(
        (row) =>
          row.active !== false &&
          normalizeExactText(row.content) === normalizeExactText(input.content),
      );
      if (exact) {
        return {
          mode: "update",
          id: exact.id,
          category: "fact",
          scope: "always",
        };
      }
    }
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
