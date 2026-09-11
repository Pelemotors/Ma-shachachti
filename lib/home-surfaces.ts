export const CHAT_SURFACES = [
  "focus",
  "forgotten",
  "schedule",
  "free-time",
] as const;
export type ChatSurface = (typeof CHAT_SURFACES)[number];

export const HOME_SURFACES = [
  {
    id: "focus",
    title: "מיקוד",
    subtitle: "מה ראוי לתשומת לב עכשיו",
    objective: "עזור לי למצוא מיקוד במה שראוי לתשומת לב עכשיו",
    primary: true,
  },
  {
    id: "schedule",
    title: "צור לי לו״ז להיום",
    subtitle: "סדר את המשימות להיום",
    objective: "צור לי לו״ז להיום",
    primary: false,
  },
  {
    id: "free-time",
    title: "יש לי זמן פנוי",
    subtitle: "מה מתאים לזמן שיש לי",
    objective: "יש לי זמן פנוי",
    primary: false,
  },
] as const satisfies ReadonlyArray<{
  id: ChatSurface;
  title: string;
  subtitle: string;
  objective: string;
  primary: boolean;
}>;

export const HOME_QUICK_LINKS = [
  { id: "chat", title: "שיחה", subtitle: "לדבר עם אותו סוכן אישי" },
  { id: "tasks", title: "משימות", subtitle: "כל מה ששמור לביצוע" },
  { id: "shopping", title: "קניות", subtitle: "רשימת הקניות" },
  { id: "checklists", title: "רשימות", subtitle: "צ׳קליסטים חוזרים" },
  { id: "recordings", title: "הקלטות", subtitle: "אודיו ותמלולים" },
  { id: "settings", title: "הגדרות", subtitle: "פרופיל, זיכרון והרשאות" },
] as const;

export function isChatSurface(value: unknown): value is ChatSurface {
  return (
    typeof value === "string" &&
    (CHAT_SURFACES as readonly string[]).includes(value)
  );
}

export function greetingForDate(date = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      hour: "numeric",
      hour12: false,
    }).format(date),
  );
  if (hour < 12) return "בוקר טוב";
  if (hour < 17) return "צהריים טובים";
  return "ערב טוב";
}
