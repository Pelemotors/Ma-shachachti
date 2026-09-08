/**
 * Closed application capabilities exposed to the personal LLM.
 *
 * This is intentionally NOT a taxonomy of what a user may mean or ask for.
 * Natural-language understanding stays open in the model; this registry only
 * describes the "hands" the application can safely execute.
 */
export const AGENT_CAPABILITY_TYPES = [
  "task.create",
  "task.update",
  "task.status",
  "task.start",
  "task.defer",
  "task.deferUntil",
  "task.step",
  "routine.create",
  "routine.update",
  "routine.pause",
  "routine.remove",
  "shopping.add",
  "shopping.check",
  "shopping.remove",
  "fact.add",
  "fact.update",
  "fact.remove",
  "reminder.add",
  "reminder.update",
  "reminder.cancel",
  "planning.set",
  "planning.clear",
  "profile.update",
  "member.upsert",
  "member.remove",
  "homeArea.upsert",
  "homeArea.remove",
  "template.exclude",
  "template.restore",
  /** Agent-facing typed capability; normalized to the internal forecast event. */
  "inventory.event",
] as const;

export type AgentCapabilityType = (typeof AGENT_CAPABILITY_TYPES)[number];

export const SAFE_AGENT_PROFILE_FIELDS = [
  "name",
  "addressAs",
  "rooms",
  "bathrooms",
  "children",
  "garden",
  "pets",
  "car",
  "dishwasher",
  "dryer",
  "householdRoutines",
  "cleaner",
] as const;

export const AGENT_CAPABILITY_CONTRACT = [
  {
    type: "task.create",
    purpose:
      "Create a new commitment or idea after understanding the user semantically.",
    policy: "proposal",
    notes:
      "categoryId is optional storage metadata. Infer it from meaning when clear; never ask only to classify.",
  },
  {
    type: "task.update/task.status/task.start/task.defer/task.deferUntil/task.step",
    purpose: "Change an existing task referenced by a real task id from state.",
    policy: "auto_or_proposal",
    notes: "Cancellation and broad destructive changes require proposal.",
  },
  {
    type: "routine.create/routine.update/routine.pause/routine.remove",
    purpose:
      "Represent a recurring responsibility after the personal LLM has semantically concluded that it is a routine.",
    policy: "auto_or_proposal",
    notes:
      "Do not infer a routine from category or keyword alone. Create/update/pause are reversible; removal is destructive and requires proposal. Domain owns recurrence and dedupe.",
  },
  {
    type: "shopping.add/shopping.check/shopping.remove",
    purpose: "Manage the existing shopping list.",
    policy: "auto_or_proposal",
    notes:
      "Removal requires proposal; checking/unchecking and adding are reversible.",
  },
  {
    type: "fact.add/fact.update/fact.remove",
    purpose:
      "Preserve user knowledge, temporary context, corrections and explicit facts.",
    policy: "auto_or_proposal",
    notes:
      "Store what is actually known. Semantic implications may trigger another capability, but do not invent life facts.",
  },
  {
    type: "reminder.add/reminder.update/reminder.cancel",
    purpose: "Create or change reminders with explicit/grounded timing.",
    policy: "auto_or_proposal",
    notes: "Never invent an exact time that was not established.",
  },
  {
    type: "planning.set/planning.clear",
    purpose: "Capture today's real constraints and available effort/time.",
    policy: "auto",
    notes: "This is context for planning, not a replacement task.",
  },
  {
    type: "profile.update",
    purpose: "Update safe household/profile facts explicitly stated by the user.",
    policy: "auto",
    notes: `Only safe fields are exposed: ${SAFE_AGENT_PROFILE_FIELDS.join(", ")}. Consent, device permissions, theme and protected settings are not agent capabilities.`,
  },
  {
    type: "member.upsert/member.remove",
    purpose:
      "Maintain real household members when the user supplies or corrects them.",
    policy: "auto_or_proposal",
    notes: "Never invent a person. Removal is destructive and requires proposal.",
  },
  {
    type: "homeArea.upsert/homeArea.remove",
    purpose:
      "Maintain real home areas explicitly stated or grounded in approved scan data.",
    policy: "auto_or_proposal",
    notes: "Removal is destructive and requires proposal.",
  },
  {
    type: "template.exclude/template.restore",
    purpose:
      "Respect explicit feedback that a home suggestion is irrelevant or relevant again.",
    policy: "auto",
    notes:
      "This changes suggestion eligibility, not natural-language interpretation.",
  },
  {
    type: "inventory.event",
    purpose:
      "Record a replenishment, depletion or correction event for forecast learning.",
    policy: "auto",
    notes:
      "Use eventType + subject. The agent never needs to emit internal marker strings.",
  },
] as const;

/** Compact bounded payload placed in agent context. No user-intent taxonomy. */
export function buildAgentCapabilityContext() {
  return {
    principle:
      "Understand the user freely; choose only among executable application capabilities.",
    capabilities: AGENT_CAPABILITY_CONTRACT,
    categoryField: {
      purpose: "optional task/routine storage classification",
      rule:
        "The executable action schema constrains valid categoryId values. Infer a category from meaning only when clear; otherwise omit it. Never ask only to classify and never use storage categories to decide what the user is allowed to mean.",
    },
  };
}
