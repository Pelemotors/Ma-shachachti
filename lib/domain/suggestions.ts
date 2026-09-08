import type { AppState } from "@/lib/model";
import { normalize } from "@/lib/model";
import { suggestions as catalogSuggestions } from "@/lib/catalog";
import { calendarSuggestions as calendarTitles } from "@/lib/insights";
import type { CategoryId } from "@/lib/taxonomy";

export type UnifiedSuggestion = {
  id: string;
  suggestionKey: string;
  source: "catalog" | "calendar";
  title: string;
  categoryId?: CategoryId;
  workMinutes?: number;
  waitMinutes?: number;
  templateId?: string | null;
};

function isHandled(state: AppState, suggestionKey: string) {
  return state.suggestionHistory.some(
    (row) =>
      row.suggestionKey === suggestionKey &&
      (row.selectedAt != null || row.declinedAt != null),
  );
}

export function calendarSuggestionKey(title: string) {
  return `calendar:${normalize(title)}`;
}

/** Filter handled suggestions before slice — catalog + calendar unified. */
export function listOpenSuggestions(
  state: AppState,
  now = new Date(),
  limit = 12,
): UnifiedSuggestion[] {
  const out: UnifiedSuggestion[] = [];

  for (const t of catalogSuggestions(state)) {
    const suggestionKey = t.id;
    if (isHandled(state, suggestionKey)) continue;
    out.push({
      id: suggestionKey,
      suggestionKey,
      source: "catalog",
      title: t.title,
      categoryId: t.categoryId,
      workMinutes: t.workMinutes,
      waitMinutes: t.waitMinutes,
      templateId: t.id,
    });
  }

  for (const title of calendarTitles(state, now)) {
    const suggestionKey = calendarSuggestionKey(title);
    if (isHandled(state, suggestionKey)) continue;
    if (out.some((x) => normalize(x.title) === normalize(title))) continue;
    out.push({
      id: suggestionKey,
      suggestionKey,
      source: "calendar",
      title,
      categoryId: "children_daily",
    });
  }

  return out.slice(0, limit);
}

export function remindersNewestFirst(state: AppState) {
  return [...state.reminders].sort((a, b) => {
    const ac = Date.parse(a.createdAt ?? a.dueAt);
    const bc = Date.parse(b.createdAt ?? b.dueAt);
    return bc - ac;
  });
}
