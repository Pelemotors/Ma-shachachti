export const RUNTIME_CAPABILITIES = {
  tasks: {
    kind: "action",
    operations: [
      "task.create",
      "task.update",
      "task.reschedule",
      "task.complete",
      "task.reopen",
      "task.delete",
    ],
    instructions:
      "Task יכולה להיות ללא מועד, עם תאריך בלבד, עם due time קשיח, או עם planned time. Reminder כבויה כברירת מחדל; הפעלה מפורשת בלבד דורשת reminder_patch=set וגם reminder_enabled=true. reminder_at הוא זמן בסיס מפורש ונפרד מ-due_at. אין ליצור כפילות מדויקת.",
  },
  memory: {
    kind: "action",
    operations: ["memory.upsert", "memory.remove"],
    instructions:
      "Memory מיועדת למידע אישי מתמשך. learning יזומה silent=true; בקשת זכירה מפורשת silent=false; תיקון משתמש מעדכן לפי id.",
  },
  presentations: {
    kind: "presentation",
    operations: ["task_list", "schedule_plan", "task_suggestions"],
    instructions:
      "Presentation היא תצוגה בלבד ואינה Persistence. השתמש רק במזהי Tasks שנמסרו בהקשר.",
  },
  consequences: {
    kind: "context-write",
    operations: ["consequence_updates"],
    instructions:
      "Consequence מתעד הבנה על משמעות דחייה ואינו משנה Task או מכריח הצגה.",
  },
  "schedule-save": {
    kind: "approval-only",
    operations: ["schedule_plan.save"],
    instructions:
      "הצעת לו״ז אינה נשמרת. שמירתה אפשרית רק לאחר אישור מפורש דרך יכולת השמירה של המערכת.",
  },
} as const;

export type RuntimeCapabilityName = keyof typeof RUNTIME_CAPABILITIES;

export function renderRuntimeCapabilities() {
  return Object.entries(RUNTIME_CAPABILITIES)
    .map(
      ([name, capability]) =>
        `- ${name} [${capability.kind}]: ${capability.operations.join(", ")}. ${capability.instructions}`,
    )
    .join("\n");
}
