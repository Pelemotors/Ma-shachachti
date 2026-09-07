import type { Action } from "@/lib/model";

export function describe(a: Action): string {
  switch (a.type) {
    case "task.create":
      return `${a.task.kind === "idea" ? "רעיון" : "משימה"}: ${a.task.title}`;
    case "shopping.add":
      return `לקניות: ${a.title}`;
    case "fact.add":
      return `לזיכרון: ${a.text}`;
    case "fact.update":
      return "עדכון פרט בזיכרון";
    case "reminder.add":
      return `תזכורת: ${a.title}`;
    case "task.defer":
      return "להוריד משימה מהתוכנית להיום";
    case "task.status":
      return a.status === "done"
        ? "סימון משימה כבוצעה"
        : a.status === "cancelled"
          ? "ביטול משימה"
          : "עדכון מצב משימה";
    case "task.update":
      return "עדכון פרטי משימה";
    case "fact.remove":
      return "הסרת פרט מהזיכרון";
    case "shopping.remove":
      return "הסרת פריט קניות";
    case "planning.set":
      return "התאמת התוכנית להיום";
    case "planning.clear":
      return "ניקוי ההתאמה הזמנית להיום";
    case "history.clear":
      return "מחיקת השיחות והיסטוריית הפעולות";
    case "memory.lifeAdmin":
      return "עדכון שעת נוחות לדברים קטנים";
    default:
      return "עדכון במידע של הבית";
  }
}
