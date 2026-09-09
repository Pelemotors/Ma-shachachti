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
    case "checklist.create":
      return `צ׳קליסט: ${a.title}`;
    case "checklist.update":
      return `שינוי שם צ׳קליסט: ${a.title}`;
    case "checklist.delete":
      return "מחיקת צ׳קליסט";
    case "checklist.item.add":
      return `פריט לצ׳קליסט: ${a.text}`;
    case "checklist.item.update":
      return `עדכון פריט בצ׳קליסט: ${a.text}`;
    case "checklist.item.remove":
      return "הסרת פריט מצ׳קליסט";
    case "checklist.item.reorder":
      return "שינוי סדר פריטים בצ׳קליסט";
    case "checklist.reset":
      return "איפוס סימונים בצ׳קליסט";
    case "planning.set":
      return "התאמת התוכנית להיום";
    case "planning.clear":
      return "ניקוי ההתאמה הזמנית להיום";
    case "schedule.set":
      return a.plannedStart
        ? `שיבוץ ללו״ז ב־${a.date}`
        : a.dayPart
          ? `שיבוץ ללו״ז ב־${a.date}`
          : `שיבוץ ל־${a.date}`;
    case "schedule.remove":
      return "הסרה מהלו״ז בלי למחוק את המשימה";
    case "history.clear":
      return "מחיקת השיחות והיסטוריית הפעולות";
    case "memory.lifeAdmin":
      return "עדכון שעת נוחות לדברים קטנים";
    default:
      return "עדכון במידע של הבית";
  }
}
