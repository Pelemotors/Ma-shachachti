import { z } from "zod";
import type { Action, AppState, Task } from "../model";
import { normalize } from "../model";
import { isHiddenUntilFuture } from "../time";
import type { AgentDecision } from "./schema";
import { ClarificationSchema } from "./schema";

/**
 * Structured semantic interpretation — LLM (or tests) produce meaning;
 * deterministic code grounds it against AppState and emits Actions.
 * This is not a keyword/regex NLP layer.
 */

export const SemanticIntentSchema = z.enum([
  "create_task",
  "update_task",
  "complete_task",
  "defer",
  "cancel_task",
  "shopping_add",
  "shopping_remove",
  "reminder",
  "persistent_fact",
  "temporary_fact",
  "observation",
  "preference",
  "daily_constraint",
  "planning_change",
  "correction",
  "clarification",
  "forecast_event",
]);
export type SemanticIntent = z.infer<typeof SemanticIntentSchema>;

export const SemanticEntityTypeSchema = z.enum([
  "task",
  "shopping",
  "reminder",
  "fact",
  "member",
  "none",
]);

export const SemanticTemporalSchema = z.enum([
  "past",
  "present",
  "future",
  "unspecified",
]);

export const SemanticInterpretationSchema = z.object({
  intent: SemanticIntentSchema,
  targetEntityType: SemanticEntityTypeSchema.default("none"),
  targetId: z.string().uuid().nullable().default(null),
  candidateIds: z.array(z.string().uuid()).max(20).default([]),
  entityHint: z.string().max(200).nullable().default(null),
  temporal: SemanticTemporalSchema.default("unspecified"),
  relatedMemberIds: z.array(z.string().uuid()).max(20).default([]),
  relatedMemberHints: z.array(z.string().max(80)).max(10).default([]),
  factKind: z
    .enum(["stable", "temporary", "inference", "observation", "preference"])
    .nullable()
    .default(null),
  persistence: z.enum(["persistent", "temporary", "none"]).default("none"),
  confidence: z.number().min(0).max(1).default(0.7),
  ambiguity: z.boolean().default(false),
  needsClarification: z.boolean().default(false),
  clarificationQuestion: z.string().max(500).nullable().default(null),
  /** Structured payload fields the domain understands — not free-form code. */
  payload: z
    .object({
      title: z.string().max(200).optional(),
      status: z
        .enum(["open", "done", "cancelled", "unknown", "in_progress"])
        .optional(),
      text: z.string().max(500).optional(),
      expiresAt: z.string().nullable().optional(),
      dueAt: z.string().optional(),
      quantity: z.string().max(60).optional(),
      urgency: z.enum(["low", "medium", "urgent"]).optional(),
      taskId: z.string().uuid().nullable().optional(),
      kind: z.enum(["task", "idea"]).optional(),
      forecastEventType: z
        .enum(["replenishment", "depletion", "correction"])
        .optional(),
      forecastSubject: z.string().max(120).optional(),
    })
    .default({}),
  evidence: z.string().max(500).nullable().default(null),
});
export type SemanticInterpretation = z.infer<
  typeof SemanticInterpretationSchema
>;

export type GroundingResult = {
  actions: Action[];
  clarification: z.infer<typeof ClarificationSchema> | null;
  unresolved: SemanticInterpretation[];
  groundedIds: string[];
};

function activeTasks(state: AppState, now: Date): Task[] {
  return state.tasks.filter(
    (t) =>
      (t.status === "open" ||
        t.status === "unknown" ||
        t.status === "in_progress") &&
      !isHiddenUntilFuture(t.hiddenUntil, now),
  );
}

/**
 * Resolve candidate tasks by explicit IDs first, then optional hint against state.
 * Never invents IDs. Ambiguous matches stay unresolved.
 */
export function resolveTaskCandidates(
  state: AppState,
  input: {
    targetId?: string | null;
    candidateIds?: string[];
    entityHint?: string | null;
  },
  now: Date = new Date(),
): { matches: Task[]; unambiguous: Task | null } {
  const byId = new Map(state.tasks.map((t) => [t.id, t]));
  const fromIds: Task[] = [];
  if (input.targetId && byId.has(input.targetId))
    fromIds.push(byId.get(input.targetId)!);
  for (const id of input.candidateIds ?? []) {
    const t = byId.get(id);
    if (t && !fromIds.some((x) => x.id === t.id)) fromIds.push(t);
  }
  if (fromIds.length === 1)
    return { matches: fromIds, unambiguous: fromIds[0] };
  if (fromIds.length > 1) return { matches: fromIds, unambiguous: null };

  const hint = input.entityHint?.trim();
  if (!hint) return { matches: [], unambiguous: null };
  const needle = normalize(hint);
  if (!needle) return { matches: [], unambiguous: null };
  const pool = activeTasks(state, now);
  const matches = pool.filter((t) => {
    const title = normalize(t.title);
    return title === needle || title.includes(needle) || needle.includes(title);
  });
  if (matches.length === 1) return { matches, unambiguous: matches[0] };
  return { matches, unambiguous: null };
}

export function resolveMemberIds(
  state: AppState,
  ids: string[],
  hints: string[],
): { resolved: string[]; ambiguousHints: string[] } {
  const byId = new Map(state.members.map((m) => [m.id, m]));
  const resolved = new Set<string>();
  for (const id of ids) {
    if (byId.has(id)) resolved.add(id);
  }
  const ambiguousHints: string[] = [];
  for (const hint of hints) {
    const n = normalize(hint);
    if (!n) continue;
    const hits = state.members.filter((m) => {
      const names = [m.name, ...m.aliases].map(normalize);
      return names.some((x) => x === n || x.includes(n) || n.includes(x));
    });
    if (hits.length === 1) resolved.add(hits[0].id);
    else if (hits.length > 1) ambiguousHints.push(hint);
  }
  return { resolved: [...resolved], ambiguousHints };
}

function clarificationFor(
  interp: SemanticInterpretation,
  matches: Task[],
): z.infer<typeof ClarificationSchema> {
  if (interp.clarificationQuestion) {
    return {
      question: interp.clarificationQuestion,
      unresolvedPart: interp.entityHint,
    };
  }
  if (matches.length > 1) {
    return {
      question: "לאיזו משימה התכוונת?",
      unresolvedPart: interp.entityHint,
    };
  }
  return {
    question: "לא זיהיתי בבירור למה התכוונת — אפשר לנסח שוב?",
    unresolvedPart: interp.entityHint,
  };
}

/**
 * Convert grounded semantic interpretations into validated Actions.
 * Guessing is forbidden: ambiguity → clarification, not an action.
 */
export function groundInterpretations(
  state: AppState,
  interpretations: Array<
    z.input<typeof SemanticInterpretationSchema> | SemanticInterpretation
  >,
  now: Date = new Date(),
): GroundingResult {
  const actions: Action[] = [];
  const unresolved: SemanticInterpretation[] = [];
  const groundedIds: string[] = [];
  let clarification: z.infer<typeof ClarificationSchema> | null = null;

  for (const raw of interpretations) {
    const interp = SemanticInterpretationSchema.parse(raw);
    if (interp.intent === "clarification" || interp.needsClarification) {
      clarification = clarification ?? clarificationFor(interp, []);
      unresolved.push(interp);
      continue;
    }
    if (interp.ambiguity && !interp.targetId) {
      clarification = clarification ?? clarificationFor(interp, []);
      unresolved.push(interp);
      continue;
    }

    const members = resolveMemberIds(
      state,
      interp.relatedMemberIds,
      interp.relatedMemberHints,
    );
    if (members.ambiguousHints.length) {
      clarification = clarification ?? {
        question: `למי התכוונת ב״${members.ambiguousHints[0]}״?`,
        unresolvedPart: members.ambiguousHints[0],
      };
      unresolved.push(interp);
      continue;
    }

    switch (interp.intent) {
      case "create_task": {
        const title = interp.payload.title ?? interp.entityHint;
        if (!title) {
          unresolved.push(interp);
          clarification = clarification ?? clarificationFor(interp, []);
          break;
        }
        actions.push({
          type: "task.create",
          task: {
            title,
            kind: interp.payload.kind ?? "task",
            relatedMemberIds: members.resolved,
            dueAt: interp.payload.dueAt ?? null,
          },
        });
        break;
      }
      case "complete_task":
      case "update_task":
      case "defer":
      case "cancel_task": {
        const { matches, unambiguous } = resolveTaskCandidates(
          state,
          {
            targetId: interp.targetId,
            candidateIds: interp.candidateIds,
            entityHint: interp.entityHint,
          },
          now,
        );
        if (!unambiguous) {
          clarification = clarification ?? clarificationFor(interp, matches);
          unresolved.push(interp);
          break;
        }
        groundedIds.push(unambiguous.id);
        if (interp.intent === "complete_task") {
          actions.push({
            type: "task.status",
            id: unambiguous.id,
            status: "done",
          });
        } else if (interp.intent === "defer") {
          actions.push({ type: "task.defer", id: unambiguous.id });
        } else if (interp.intent === "cancel_task") {
          actions.push({
            type: "task.status",
            id: unambiguous.id,
            status: "cancelled",
          });
        } else if (interp.payload.title) {
          actions.push({
            type: "task.update",
            id: unambiguous.id,
            patch: {
              title: interp.payload.title,
              ...(members.resolved.length
                ? { relatedMemberIds: members.resolved }
                : {}),
            },
          });
        }
        break;
      }
      case "shopping_add": {
        const title = interp.payload.title ?? interp.entityHint;
        if (!title) {
          unresolved.push(interp);
          clarification = clarification ?? clarificationFor(interp, []);
          break;
        }
        actions.push({
          type: "shopping.add",
          title,
          quantity: interp.payload.quantity,
        });
        break;
      }
      case "shopping_remove": {
        const id = interp.targetId;
        if (!id || !state.shopping.some((s) => s.id === id)) {
          unresolved.push(interp);
          clarification = clarification ?? clarificationFor(interp, []);
          break;
        }
        groundedIds.push(id);
        actions.push({ type: "shopping.remove", id });
        break;
      }
      case "reminder": {
        const title = interp.payload.title ?? interp.entityHint;
        const dueAt = interp.payload.dueAt;
        if (!title || !dueAt) {
          unresolved.push(interp);
          clarification = clarification ?? {
            question: "מתי להזכיר, ועל מה?",
            unresolvedPart: interp.entityHint,
          };
          break;
        }
        actions.push({
          type: "reminder.add",
          title,
          dueAt,
          taskId: interp.payload.taskId ?? null,
          urgency: interp.payload.urgency,
        });
        break;
      }
      case "persistent_fact":
      case "temporary_fact":
      case "observation":
      case "preference": {
        const text = interp.payload.text ?? interp.entityHint;
        if (!text) {
          unresolved.push(interp);
          clarification = clarification ?? clarificationFor(interp, []);
          break;
        }
        const kind =
          interp.intent === "persistent_fact" || interp.intent === "preference"
            ? "stable"
            : interp.intent === "observation"
              ? "inference"
              : "temporary";
        actions.push({
          type: "fact.add",
          text,
          kind,
          expiresAt:
            kind === "temporary" ? (interp.payload.expiresAt ?? null) : null,
        });
        break;
      }
      case "correction": {
        if (
          interp.targetId &&
          state.facts.some((f) => f.id === interp.targetId)
        ) {
          groundedIds.push(interp.targetId);
          const patch: {
            text?: string;
            expiresAt?: string | null;
          } = {};
          if (interp.payload.text) patch.text = interp.payload.text;
          if (interp.payload.expiresAt !== undefined)
            patch.expiresAt = interp.payload.expiresAt;
          actions.push({
            type: "fact.update",
            id: interp.targetId,
            patch,
          });
        } else {
          const text = interp.payload.text ?? interp.entityHint;
          if (!text) {
            unresolved.push(interp);
            clarification = clarification ?? clarificationFor(interp, []);
            break;
          }
          actions.push({
            type: "fact.add",
            text,
            kind: "stable",
            expiresAt: null,
          });
        }
        break;
      }
      case "daily_constraint":
      case "planning_change": {
        // Planning payloads stay in AgentDecision.proposal / explicit planning.set —
        // semantic layer only flags need for structured planning action from LLM.
        unresolved.push(interp);
        if (!interp.payload.title && !interp.payload.text) {
          clarification = clarification ?? {
            question: "מה בדיוק השתנה בלו״ז להיום?",
            unresolvedPart: interp.entityHint,
          };
        }
        break;
      }
      case "forecast_event": {
        // Structured evidence only — interval/confidence live in forecast domain.
        const subject =
          interp.payload.forecastSubject ??
          interp.entityHint ??
          interp.payload.title ??
          null;
        const eventType = interp.payload.forecastEventType;
        if (subject && eventType) {
          actions.push({
            type: "fact.add",
            text: `forecast:${eventType}:${subject}`,
            kind: "inference",
            expiresAt: null,
          });
        } else {
          unresolved.push(interp);
          clarification = clarification ?? {
            question: "מה בדיוק קרה לגבי המלאי או הצריכה?",
            unresolvedPart: interp.entityHint,
          };
        }
        break;
      }
      default:
        unresolved.push(interp);
    }
  }

  return { actions, clarification, unresolved, groundedIds };
}

/**
 * Canonical fingerprint of semantic meaning for paraphrase tests —
 * compares intent + grounded target + payload essentials, not surface wording.
 */
export function semanticFingerprint(
  interp: SemanticInterpretation,
  groundedId?: string | null,
): string {
  const i = SemanticInterpretationSchema.parse(interp);
  return [
    i.intent,
    groundedId ?? i.targetId ?? "",
    i.payload.title ?? i.entityHint ?? "",
    i.payload.status ?? "",
    i.factKind ?? i.persistence,
    i.temporal,
    [...(i.relatedMemberIds ?? [])].sort().join(","),
  ].join("|");
}

/**
 * Post-process LLM AgentDecision: drop actions that reference missing entities;
 * if a complete/defer/status action is invalid and no clarification exists, ask.
 */
export function enforceReferentialIntegrity(
  state: AppState,
  decision: AgentDecision,
): AgentDecision {
  const taskIds = new Set(state.tasks.map((t) => t.id));
  const shoppingIds = new Set(state.shopping.map((s) => s.id));
  const factIds = new Set(state.facts.map((f) => f.id));
  const reminderIds = new Set(state.reminders.map((r) => r.id));
  const memberIds = new Set(state.members.map((m) => m.id));

  const kept: Action[] = [];
  let missingRef = false;
  for (const action of decision.explicitActions) {
    if (
      action.type === "task.status" ||
      action.type === "task.defer" ||
      action.type === "task.deferUntil" ||
      action.type === "task.start" ||
      action.type === "task.update" ||
      action.type === "task.step"
    ) {
      if (!taskIds.has(action.id)) {
        missingRef = true;
        continue;
      }
    }
    if (action.type === "shopping.remove" || action.type === "shopping.check") {
      if (!shoppingIds.has(action.id)) {
        missingRef = true;
        continue;
      }
    }
    if (action.type === "fact.remove" || action.type === "fact.update") {
      if (!factIds.has(action.id)) {
        missingRef = true;
        continue;
      }
    }
    if (action.type === "reminder.cancel") {
      if (!reminderIds.has(action.id)) {
        missingRef = true;
        continue;
      }
    }
    if (action.type === "member.remove") {
      if (!memberIds.has(action.id)) {
        missingRef = true;
        continue;
      }
    }
    if (action.type === "task.create" && action.task.relatedMemberIds?.length) {
      const valid = action.task.relatedMemberIds.filter((id) =>
        memberIds.has(id),
      );
      kept.push({
        ...action,
        task: { ...action.task, relatedMemberIds: valid },
      });
      continue;
    }
    kept.push(action);
  }

  let clarification = decision.clarification;
  if (missingRef && !clarification && kept.length === 0) {
    clarification = {
      question: "לא מצאתי את הפריט במצב הבית — אפשר לציין למה התכוונת?",
      unresolvedPart: null,
    };
  }

  // Completing every open task at once is almost always guessing.
  const openTaskCount = state.tasks.filter(
    (t) =>
      t.status === "open" ||
      t.status === "unknown" ||
      t.status === "in_progress",
  ).length;
  const completes = kept.filter(
    (a) => a.type === "task.status" && a.status === "done",
  );
  if (completes.length > 1 && completes.length >= openTaskCount) {
    clarification = clarification ?? {
      question: "לאיזו משימה התכוונת שסיימת?",
      unresolvedPart: null,
    };
    return {
      ...decision,
      explicitActions: kept.filter(
        (a) => !(a.type === "task.status" && a.status === "done"),
      ),
      clarification,
    };
  }

  const defers = kept.filter(
    (a) => a.type === "task.defer" || a.type === "task.deferUntil",
  );
  if (defers.length > 1 && defers.length >= openTaskCount) {
    clarification = clarification ?? {
      question: "לאיזו משימה התכוונת להסתיר מהיום?",
      unresolvedPart: null,
    };
    return {
      ...decision,
      explicitActions: kept.filter(
        (a) => a.type !== "task.defer" && a.type !== "task.deferUntil",
      ),
      clarification,
    };
  }

  return { ...decision, explicitActions: kept, clarification };
}
