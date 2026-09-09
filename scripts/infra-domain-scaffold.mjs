/**
 * Creates domain / server / persistence / contracts / errors scaffolding
 * without changing product behavior (re-exports + thin wrappers).
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const w = (rel, content) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.replace(/\r\n/g, "\n"));
  console.log("W", rel);
};

// --- Domain ---
w(
  "lib/domain/tasks.ts",
  `import type { AppState, Task } from "../model";
import {
  estimatedMinutes,
  shouldAskWorkTime,
  visible,
  score,
  whatMatters,
  followUps,
  blocked,
} from "../engine";

export {
  estimatedMinutes,
  shouldAskWorkTime,
  visible,
  score,
  whatMatters,
  followUps,
  blocked,
};

export function openTasks(state: AppState): Task[] {
  return state.tasks.filter((t) =>
    ["open", "unknown", "in_progress"].includes(t.status),
  );
}
`,
);

w(
  "lib/domain/planning/plan-day.ts",
  `export { planDay, buildDailyPlanSession, activeDailyPlan } from "../../engine";
`,
);
w(
  "lib/domain/planning/replan.ts",
  `export { replanDailyPlan } from "../../engine";
`,
);
w(
  "lib/domain/planning/constraints.ts",
  `export type { PlanningConstraint, DailyPlanSession, DailyPlanItem } from "../../model";
`,
);
w(
  "lib/domain/planning/scoring.ts",
  `export { score } from "../../engine";
`,
);
w(
  "lib/domain/planning/schedule.ts",
  `/** Schedule helpers live in planDay / freeTime for now. */
export {};
`,
);
w(
  "lib/domain/planning/index.ts",
  `export * from "./plan-day";
export * from "./replan";
export * from "./constraints";
export * from "./scoring";
`,
);

w(
  "lib/domain/free-time.ts",
  `import type { AppState } from "../model";
import { freeTimeV2, opportunities } from "../engine";

export type FreeTimeInput = {
  state: AppState;
  duration: number;
  effort: number;
  now?: Date;
};

export function freeTime(input: FreeTimeInput) {
  const result = freeTimeV2(
    input.state,
    input.duration,
    input.effort,
    input.now,
  );
  return {
    urgent: result.closeFirst,
    opportunities: result.outsidePlan,
    closeFirst: result.closeFirst,
    outsidePlan: result.outsidePlan,
  };
}

export { freeTimeV2, opportunities };
`,
);

w(
  "lib/domain/shopping.ts",
  `/** Shopping domain — NL proposal parsing removed from production exports. */
`,
);

w(
  "lib/domain/proposals.ts",
  `import type { Action } from "../model";

export type ProposalStatus = "pending" | "approved" | "rejected" | "expired";

export type ProposalBase = {
  id: string;
  turnId: string | null;
  status: ProposalStatus;
  createdAt: string;
  expiresAt: string | null;
  sourceRevision: number;
};

export type ActionProposal = ProposalBase & {
  kind: "actions";
  summary: string;
  proposedActions: Action[];
};

export type ShoppingProposal = ProposalBase & {
  kind: "shopping";
  items: { title: string; quantity?: string }[];
};

export type PlanProposal = ProposalBase & {
  kind: "plan";
  summary: string;
  proposedActions: Action[];
};

export type Proposal = ActionProposal | ShoppingProposal | PlanProposal;
`,
);

w(
  "lib/domain/memory.ts",
  `export { activeFacts, learning } from "../engine";
`,
);

w(
  "lib/domain/personalization.ts",
  `export { compactConversation, upsertLearningInsight } from "../personalization";
`,
);

w(
  "lib/domain/taxonomy.ts",
  `export {
  TASK_CATEGORIES,
  CATEGORY_IDS,
  categoryById,
  classifyLegacyCategory,
  categoryLabel,
  getCategory,
  getCategoryLabel,
  isCategory,
  getCategoryGroup,
  groupTasksByCategory,
} from "../taxonomy";
`,
);

w(
  "lib/domain/dedupe.ts",
  `export { findSemanticDuplicate } from "../engine";
`,
);

w(
  "lib/domain/index.ts",
  `export * from "./tasks";
export * from "./planning";
export * from "./free-time";
export * from "./shopping";
export * from "./proposals";
export * from "./memory";
export * from "./personalization";
export * from "./taxonomy";
export * from "./dedupe";
export { applyActions, requiresConfirmation } from "./apply-actions";
`,
);

// --- Errors ---
w(
  "lib/errors/codes.ts",
  `export const ERROR_CODES = [
  "revision_conflict",
  "ai_timeout",
  "ai_invalid_output",
  "ai_insufficient_quota",
  "ai_rate_limited",
  "ai_configuration",
  "ai_upstream",
  "proposal_expired",
  "state_save_failed",
  "state_read_failed",
  "auth_required",
  "session_expired",
  "account_not_approved",
  "cloud_not_configured",
  "backend_not_configured",
  "invalid_input",
  "invalid_json",
  "missing_body",
  "payload_too_large",
  "hourly_limit",
  "budget_unavailable",
  "reminder_read_failed",
  "request_failed",
  "internal_error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Canonical Hebrew messages for UI mapping. Server may still send message text. */
export const ERROR_MESSAGES_HE: Record<ErrorCode, string> = {
  revision_conflict: "המידע השתנה בחלון אחר. טענו מחדש לפני ניסיון נוסף.",
  ai_timeout: "הסוכן לא הצליח לענות בזמן. לא בוצעו שינויים; אפשר לנסות שוב.",
  ai_invalid_output: "התשובה מהסוכן לא הייתה תקינה. לא בוצעו שינויים.",
  ai_insufficient_quota:
    "מכסת ה-AI הסתיימה כרגע. לא בוצעו שינויים; אפשר להמשיך ידנית או לנסות לאחר חידוש הקרדיט.",
  ai_rate_limited:
    "שירות ה-AI עמוס כרגע. לא בוצעו שינויים; אפשר לנסות שוב בעוד רגע.",
  ai_configuration: "חיבור ה-AI דורש תיקון בהגדרות השרת. לא בוצעו שינויים.",
  ai_upstream: "הסוכן לא הצליח לענות כרגע. לא בוצעו שינויים; אפשר לנסות שוב.",
  proposal_expired: "המידע השתנה מאז ההצעה. יש לבקש הצעה חדשה.",
  state_save_failed: "השמירה לא הצליחה. השינוי עדיין לא נשמר.",
  state_read_failed: "לא ניתן לקרוא את המידע בענן.",
  auth_required: "צריך להתחבר כדי להמשיך.",
  session_expired: "ההתחברות הסתיימה. יש להתחבר שוב.",
  account_not_approved: "החשבון ממתין לאישור מנהל.",
  cloud_not_configured: "שמירה בענן עדיין לא מחוברת.",
  backend_not_configured: "שירות הרקע עדיין לא הוגדר.",
  invalid_input: "המידע שנשלח אינו תקין.",
  invalid_json: "הבקשה אינה תקינה.",
  missing_body: "חסר תוכן.",
  payload_too_large: "הבקשה גדולה מדי.",
  hourly_limit:
    "הגענו למכסת הבקשות לשעה. אפשר להמשיך לנהל משימות ולנסות שוב בהמשך.",
  budget_unavailable: "בקרת השימוש אינה זמינה.",
  reminder_read_failed: "לא ניתן לקרוא את מצב התזכורות.",
  request_failed: "הפעולה לא הושלמה. אפשר לנסות שוב.",
  internal_error: "הפעולה לא הושלמה. אפשר לנסות שוב.",
};

export function messageForCode(code: string, fallback?: string) {
  return (
    ERROR_MESSAGES_HE[code as ErrorCode] ??
    fallback ??
    ERROR_MESSAGES_HE.internal_error
  );
}
`,
);

w(
  "lib/errors/index.ts",
  `export * from "./codes";
`,
);

console.log("domain+errors scaffolding written");
