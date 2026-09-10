export const CHAT_SURFACES = ["forgotten", "schedule", "free-time"] as const;
export type ChatSurface = (typeof CHAT_SURFACES)[number];

export const HOME_SURFACES = [
  {
    id: "forgotten",
    title: "מה שכחתי?",
    subtitle: "מה כדאי לשים לב אליו עכשיו",
    objective: "מה שכחתי?",
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
