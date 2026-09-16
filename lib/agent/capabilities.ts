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
      "task.subtask.add",
      "task.subtask.update",
      "task.subtask.toggle",
      "task.subtask.remove",
    ],
    instructions:
      "Task יכולה להיות ללא מועד, עם תאריך בלבד, עם due time קשיח, או עם planned time. Reminder כבויה כברירת מחדל; הפעלה מפורשת בלבד דורשת reminder_patch=set וגם reminder_enabled=true. reminder_at הוא זמן בסיס מפורש ונפרד מ-due_at. אין ליצור כפילות מדויקת. תתי־משימות (checklist של משימה): task.subtask.add דורש task_id+title; update/toggle/remove דורשים id של תת־המשימה; toggle דורש done.",
  },
  memory: {
    kind: "action",
    operations: ["memory.upsert", "memory.remove"],
    instructions:
      'Memory מיועדת למידע אישי מתמשך. למידה חדשה אינה מוחקת הכול: חריגה זמנית (מחר/הפעם) נשמרת בנפרד בלי לדרוס העדפה כללית; עדכון מעכשיו מסמן ישן כלא־פעיל. learning יזומה silent=true; בקשת זכירה מפורשת silent=false; תיקון משתמש מעדכן לפי id. כאשר המשתמש מלמד קשר פעולות מפורש (כש־A אז גם B), חובה באותו turn memory.upsert עם content כ־JSON בלבד: {"v":1,"kind":"action_followup","trigger":"A","followup":"B","ordering":"after","scope":"always","active":true}. אל תבטיח במילים בלי action. חריגה חד־פעמית: turn_flags.suppress_learned_followups=true ו־standing_rule_change=false — אל תמחק/תשנה את ה־relation הכללי.',
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
      "רשימת קניות אישית. add דורש title; quantity אופציונלי ומוגדר כברירת מחדל ל־1 — אל תשאל על כמות אם המשתמש לא ציין. update/toggle/remove דורשות id מההקשר. toggle דורש purchased. בקשת קנייה ברורה → shopping.add מיד בלי שאלת אישור.",
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
    operations: ["task_list", "schedule_plan", "task_suggestions", "insights"],
    instructions:
      "Presentation היא תצוגה בלבד ואינה Persistence. insights מיועד להסקה/פערים ב־deep-check בלבד. השתמש רק במזהי Tasks שנמסרו בהקשר.",
  },
  "context-access": {
    kind: "context-read",
    operations: ["context_requests"],
    instructions:
      "בקש Deep Access רק כשחסר מידע קריטי. entity אחד מהרשימה הסגורה; לכל היותר סיבוב נוסף אחד.",
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
