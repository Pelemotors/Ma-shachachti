export const HOME_SURFACES = [
  {
    id: "forgotten",
    title: "מה שכחתי?",
    subtitle: "מה כדאי לשים לב אליו עכשיו",
    objective: "מה שכחתי? תעדף לי מתוך המשימות שלי מה כדאי להציג עכשיו.",
    primary: true,
  },
  {
    id: "schedule",
    title: "צור לי לו״ז להיום",
    subtitle: "סדר את המשימות להיום",
    objective: "צור לי לו״ז להיום מתוך המשימות שלי.",
    primary: false,
  },
  {
    id: "free-time",
    title: "יש לי זמן פנוי",
    subtitle: "מה מתאים לזמן שיש לי",
    objective: "יש לי זמן פנוי. מה מתוך המשימות שלי מתאים עכשיו?",
    primary: false,
  },
] as const;

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
