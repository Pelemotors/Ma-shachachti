/**
 * Execution Truth — the model describes intent/proposal; the server alone
 * acknowledges persistence. Not a natural-language intent classifier.
 */
import type { Action } from "@/lib/model";

export const PROPOSAL_NOT_EXECUTED_NOTICE =
  "השינוי עדיין לא בוצע. הוא ממתין לאישור שלך.";

/**
 * Server-authored receipts and leftover model copy of those receipts.
 * Exact line match only — not a semantic dictionary of user meaning.
 */
const SERVER_RECEIPT_LINES = new Set([
  "בוצע.",
  "בוצע",
  "ביצעתי את העדכונים.",
  "התזכורת נוספה.",
  "התזכורת עודכנה.",
  "התזכורת בוטלה.",
  "רשימת הקניות עודכנה.",
  "הצ׳קליסט נוצר.",
  "הצ׳קליסט עודכן.",
  "המידע נשמר.",
  "המידע עודכן.",
  "פרטי הבית עודכנו.",
  "השגרה נשמרה.",
  "השגרה עודכנה.",
  "השינוי להיום נשמר.",
  "ההעדפה נשמרה.",
  "המשימה עודכנה.",
]);

export function neutralizePrematureExecutionClaims(reply: string): string {
  const kept = reply
    .split("\n")
    .filter((line) => !SERVER_RECEIPT_LINES.has(line.trim()));
  const text = kept.join("\n").trim();
  return text || "אפשר להמשיך.";
}

/** Grounded only in actions that this turn actually persists. */
export function buildExecutionReceipt(actions: Action[]): string {
  const persisted = actions.filter(
    (a) =>
      a.type !== "message.add" &&
      a.type !== "workingMemory.patch" &&
      a.type !== "workingMemory.clear" &&
      a.type !== "operation.record" &&
      a.type !== "durationFeedback.markAsked",
  );
  if (!persisted.length) return "";
  if (persisted.length > 1) return "ביצעתי את העדכונים.";
  const action = persisted[0]!;
  switch (action.type) {
    case "reminder.add":
      return "התזכורת נוספה.";
    case "reminder.update":
      return "התזכורת עודכנה.";
    case "reminder.cancel":
      return "התזכורת בוטלה.";
    case "shopping.add":
    case "shopping.check":
      return "רשימת הקניות עודכנה.";
    case "checklist.create":
      return "הצ׳קליסט נוצר.";
    case "checklist.update":
    case "checklist.item.add":
    case "checklist.item.update":
    case "checklist.item.remove":
    case "checklist.item.reorder":
    case "checklist.item.toggle":
    case "checklist.reset":
      return "הצ׳קליסט עודכן.";
    case "fact.add":
      return "המידע נשמר.";
    case "fact.update":
      return "המידע עודכן.";
    case "profile.update":
    case "member.upsert":
    case "homeArea.upsert":
      return "פרטי הבית עודכנו.";
    case "routine.create":
      return "השגרה נשמרה.";
    case "routine.update":
    case "routine.pause":
      return "השגרה עודכנה.";
    case "planning.set":
    case "planning.clear":
      return "השינוי להיום נשמר.";
    case "schedule.set":
      return "השיבוץ בלו״ז נשמר.";
    case "schedule.remove":
      return "המשימה הוסרה מהלו״ז.";
    case "template.exclude":
    case "template.restore":
      return "ההעדפה נשמרה.";
    case "task.update":
    case "task.status":
    case "task.start":
    case "task.defer":
    case "task.deferUntil":
    case "task.step":
      return "המשימה עודכנה.";
    default:
      return "בוצע.";
  }
}

export function composeAssistantText(input: {
  modelReply: string;
  clarificationQuestion?: string | null;
  proposalPending: boolean;
  persistedActions: Action[];
}): { conversational: string; receipt: string; text: string } {
  let conversational = input.modelReply.trim();
  if (
    input.clarificationQuestion &&
    !conversational.includes(input.clarificationQuestion)
  ) {
    conversational = `${conversational}\n\n${input.clarificationQuestion}`;
  }
  conversational = neutralizePrematureExecutionClaims(conversational);

  const receipt = buildExecutionReceipt(input.persistedActions);

  const parts: string[] = [];
  if (input.proposalPending) parts.push(PROPOSAL_NOT_EXECUTED_NOTICE);
  parts.push(conversational);
  if (receipt) parts.push(receipt);

  return {
    conversational,
    receipt,
    text: parts.filter(Boolean).join("\n\n"),
  };
}
