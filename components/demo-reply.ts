import type { Action, AppState } from "@/lib/model";

/** Local demo has no agent — never pretend to understand natural language. */
export function demoReply(
  _text: string,
  _state: AppState,
  _context: string | null,
): { reply: string; actions: Action[] } {
  return {
    reply:
      "שיחה חופשית עם הסוכן האישי זמינה בחיבור ענן. בדמו מקומי אפשר להוסיף ולנהל משימות דרך כפתור הפלוס.",
    actions: [],
  };
}
