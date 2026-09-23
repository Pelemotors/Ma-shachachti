/**
 * Dev-only Chat V4 visual fixture. Never persisted, never sent to an API.
 */
export const CHAT_V4_VISUAL_QA = false;

export const chatV4Fixture = {
  sessionId: "qa-chat-v4",
  messages: [
    {
      id: "qa-u1",
      role: "user" as const,
      content: "היי, אני מרגישה קצת עומס היום.\nאפשר לעזור לי לארגן את היום?",
      created_at: "2026-09-21T06:12:00.000Z",
    },
    {
      id: "qa-a1",
      role: "assistant" as const,
      content:
        "בטח! אשמח לעזור.\nיש לך 4 משימות פתוחות להיום.\nנוכל לבנות לך לו״ז מאוזן עם זמן גם לדברים החשובים וגם להפסקות קטנות.\nרוצה שאבנה עכשיו?",
      created_at: "2026-09-21T06:13:00.000Z",
    },
    {
      id: "qa-u2",
      role: "user" as const,
      content: "כן, בבקשה. וגם תוסיף לי לקנות מגבונים",
      created_at: "2026-09-21T06:14:00.000Z",
    },
    {
      id: "qa-a2",
      role: "assistant" as const,
      content: "מעולה! הוספתי את המגבונים לרשימה,\nומתחיל לבנות את הלו״ז שלך להיום.",
      created_at: "2026-09-21T06:14:20.000Z",
    },
  ],
};
