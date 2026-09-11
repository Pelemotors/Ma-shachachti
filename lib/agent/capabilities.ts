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
  shopping: {
    kind: "action",
    operations: [
      "shopping.add",
      "shopping.update",
      "shopping.toggle",
      "shopping.remove",
    ],
    instructions:
      "רשימת קניות אישית. add דורש title ו-quantity; update/toggle/remove דורשות id מההקשר. toggle דורש purchased.",
  },
  checklists: {
    kind: "action",
    operations: [
      "checklist.create",
      "checklist.rename",
      "checklist.delete",
      "checklist.item.add",
      "checklist.item.update",
      "checklist.item.toggle",
      "checklist.item.remove",
    ],
    instructions:
      "רשימות אישיות. פעולות item דורשות checklist_id; עדכון/toggle/remove דורשים id של פריט מאותה רשימה. toggle דורש checked.",
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
