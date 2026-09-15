import type { ChatSurface } from "../home-surfaces.ts";
import type { ClientPresentation } from "../types.ts";
import { forgottenFallback } from "../presentation.ts";

export const DEEP_CHECK_FALLBACK_REPLY =
  "לא הצלחתי להשלים את הבדיקה העמוקה כרגע. אפשר לנסות שוב.";

export function surfaceFallbackReply(
  surface: ChatSurface | null,
  presentation: ClientPresentation | null,
): string {
  if (surface === "deep-check") {
    if (presentation?.type === "insights" && presentation.items.length > 0) {
      return "הנה כמה נקודות חלקיות מהבדיקה.";
    }
    return DEEP_CHECK_FALLBACK_REPLY;
  }
  if (surface === "forgotten" || surface === "focus") {
    const count =
      presentation?.type === "task_list" ? presentation.tasks.length : 0;
    return forgottenFallback(count);
  }
  if (surface === "schedule") {
    return presentation?.type === "schedule_plan"
      ? "תוכנית מוצעת."
      : "לא הצלחתי לבנות לו״ז כרגע. אפשר לנסות שוב.";
  }
  if (surface === "free-time") {
    return presentation?.type === "task_list" ||
      presentation?.type === "task_suggestions"
      ? "הנה כמה אפשרויות לחלון הזמן."
      : "לא מצאתי משהו מתאים לחלון הזמן כרגע.";
  }
  return "לא הצלחתי להשלים את התשובה כרגע. אפשר לנסות שוב.";
}

/**
 * Ensure the user always gets a non-empty reply for UI surfaces.
 * Never 502 solely because presentation/reply sanitization emptied the text.
 */
export function ensureUserReply(input: {
  reply: string;
  surface: ChatSurface | null;
  presentation: ClientPresentation | null;
}): string {
  const trimmed = input.reply.trim();
  if (trimmed) return trimmed;
  return surfaceFallbackReply(input.surface, input.presentation);
}
