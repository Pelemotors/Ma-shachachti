import type { Action, AppState } from "@/lib/model";

export function demoReply(
  text: string,
  state: AppState,
  context: string | null,
): { reply: string; actions: Action[] } {
  const clean = text.trim();
  if (/^אולי\s/.test(clean))
    return {
      reply: "אפשר לשמור את זה כרעיון, בלי להתחייב להיום.",
      actions: [
        {
          type: "task.create",
          task: { title: clean.replace(/^אולי\s+/, ""), kind: "idea" },
        },
      ],
    };
  if (/^(צריך|צריכה|חייב|חייבת)\s/.test(clean) && !/[,.\n]/.test(clean))
    return {
      reply: "אפשר להוסיף את זה לרשימה.",
      actions: [
        {
          type: "task.create",
          task: {
            title: clean.replace(/^(צריך|צריכה|חייב|חייבת)\s+/, ""),
            kind: "task",
          },
        },
      ],
    };
  if (context && /לא היום/.test(clean))
    return {
      reply: "אפשר להוריד את המשימה מהתוכנית להיום ולהשאיר אותה פתוחה.",
      actions: [{ type: "task.defer", id: context }],
    };
  if (context && /^(סיימתי|בוצע)/.test(clean))
    return {
      reply: "אפשר לסמן את המשימה שבחרת כבוצעה.",
      actions: [{ type: "task.status", id: context, status: "done" }],
    };
  return {
    reply:
      "זו שיחת הדגמה עם הבנה בסיסית בלבד. אפשר לנסות ״צריך לקפל כביסה״ או ״אולי להכין פשטידה״, או להוסיף משימה דרך כפתור הפלוס. שיחה חופשית זמינה לאחר חיבור הסוכן.",
    actions: [],
  };
}
