import type { Action, AppState } from "@/lib/model";
import type { AgentDecision } from "@/lib/agent/schema";

/**
 * Referential integrity only: validate references to entities the application
 * actually has. This layer deliberately does not guess what the user meant.
 * Semantic judgment belongs to the personal LLM; legality belongs to Domain.
 */
export function filterReferentialActions(state: AppState, actions: Action[]) {
  const taskIds = new Set(state.tasks.map((t) => t.id));
  const routineIds = new Set(state.routines.map((r) => r.id));
  const shoppingIds = new Set(state.shopping.map((s) => s.id));
  const factIds = new Set(state.facts.map((f) => f.id));
  const reminderIds = new Set(state.reminders.map((r) => r.id));
  const memberIds = new Set(state.members.map((m) => m.id));
  const homeAreaIds = new Set(state.homeAreas.map((a) => a.id));
  const kept: Action[] = [];
  const rejected: Action[] = [];

  for (const action of actions) {
    let valid = true;

    if (
      action.type === "task.status" ||
      action.type === "task.defer" ||
      action.type === "task.deferUntil" ||
      action.type === "task.start" ||
      action.type === "task.update" ||
      action.type === "task.step"
    ) {
      valid = taskIds.has(action.id);
    } else if (
      action.type === "routine.update" ||
      action.type === "routine.pause" ||
      action.type === "routine.remove"
    ) {
      valid = routineIds.has(action.id);
      if (
        valid &&
        action.type === "routine.update" &&
        action.patch.sourceFactId &&
        !factIds.has(action.patch.sourceFactId)
      )
        valid = false;
    } else if (
      action.type === "shopping.remove" ||
      action.type === "shopping.check"
    ) {
      valid = shoppingIds.has(action.id);
    } else if (action.type === "fact.remove" || action.type === "fact.update") {
      valid = factIds.has(action.id);
    } else if (
      action.type === "reminder.cancel" ||
      action.type === "reminder.update"
    ) {
      valid = reminderIds.has(action.id);
    } else if (action.type === "member.remove") {
      valid = memberIds.has(action.id);
    } else if (action.type === "homeArea.remove") {
      valid = homeAreaIds.has(action.id);
    } else if (
      action.type === "routine.create" &&
      action.routine.sourceFactId &&
      !factIds.has(action.routine.sourceFactId)
    ) {
      valid = false;
    }

    if (!valid) {
      rejected.push(action);
      continue;
    }

    if (action.type === "task.create") {
      if (action.task.routineId && !routineIds.has(action.task.routineId)) {
        rejected.push(action);
        continue;
      }
      const relatedMemberIds = (action.task.relatedMemberIds ?? []).filter(
        (id) => memberIds.has(id),
      );
      const relatedHomeAreaIds = (action.task.homeAreaIds ?? []).filter((id) =>
        homeAreaIds.has(id),
      );
      const normalized: Action = {
        ...action,
        task: {
          ...action.task,
          relatedMemberIds,
          homeAreaIds: relatedHomeAreaIds,
        },
      };
      kept.push(normalized);
      if (action.task.id) taskIds.add(action.task.id);
      continue;
    }

    if (action.type === "routine.create") {
      const normalized: Action = {
        ...action,
        routine: {
          ...action.routine,
          relatedMemberIds: (action.routine.relatedMemberIds ?? []).filter(
            (id) => memberIds.has(id),
          ),
          homeAreaIds: (action.routine.homeAreaIds ?? []).filter((id) =>
            homeAreaIds.has(id),
          ),
        },
      };
      kept.push(normalized);
      if (action.routine.id) routineIds.add(action.routine.id);
      continue;
    }

    if (action.type === "routine.update") {
      kept.push({
        ...action,
        patch: {
          ...action.patch,
          ...(action.patch.relatedMemberIds
            ? {
                relatedMemberIds: action.patch.relatedMemberIds.filter((id) =>
                  memberIds.has(id),
                ),
              }
            : {}),
          ...(action.patch.homeAreaIds
            ? {
                homeAreaIds: action.patch.homeAreaIds.filter((id) =>
                  homeAreaIds.has(id),
                ),
              }
            : {}),
        },
      });
      continue;
    }

    if (action.type === "member.upsert" && action.member.id)
      memberIds.add(action.member.id);
    if (action.type === "homeArea.upsert" && action.area.id)
      homeAreaIds.add(action.area.id);

    kept.push(action);
  }

  return { kept, rejected };
}

export function enforceReferentialIntegrity(
  state: AppState,
  decision: AgentDecision,
): AgentDecision {
  const filtered = filterReferentialActions(state, decision.explicitActions);
  let clarification = decision.clarification;

  if (
    filtered.rejected.length > 0 &&
    filtered.kept.length === 0 &&
    !clarification
  ) {
    clarification = {
      question: "לא מצאתי את הפריט במצב הבית — אפשר לציין למה התכוונת?",
      unresolvedPart: null,
    };
  }

  return {
    ...decision,
    explicitActions: filtered.kept,
    clarification,
  };
}
