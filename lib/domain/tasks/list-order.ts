import type { AppState, Task } from "@/lib/model";
import { isActiveVisibleTask } from "./visibility";
import { msUntil } from "@/lib/time";
import { getCategory } from "@/lib/taxonomy";

/**
 * Deterministic ordering for the active tasks list (not Home).
 * overdue → due soon → priority → category order → createdAt
 */
export function getActiveTasksForList(
  state: AppState,
  now: Date = new Date(),
  filter?: { text?: string; categoryId?: string },
): Task[] {
  const text = filter?.text?.trim() ?? "";
  const categoryId = filter?.categoryId;
  return state.tasks
    .filter((t) => isActiveVisibleTask(t, now))
    .filter((t) => (text ? t.title.includes(text) : true))
    .filter((t) =>
      categoryId && categoryId !== "הכול" ? t.categoryId === categoryId : true,
    )
    .sort((a, b) => {
      const aOver = a.dueAt && Date.parse(a.dueAt) < now.getTime() ? 0 : 1;
      const bOver = b.dueAt && Date.parse(b.dueAt) < now.getTime() ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      const aSoon =
        a.dueAt && msUntil(a.dueAt, now) < 72 * 3600000
          ? msUntil(a.dueAt, now)
          : Number.POSITIVE_INFINITY;
      const bSoon =
        b.dueAt && msUntil(b.dueAt, now) < 72 * 3600000
          ? msUntil(b.dueAt, now)
          : Number.POSITIVE_INFINITY;
      if (aSoon !== bSoon) return aSoon - bSoon;
      if (b.priority !== a.priority) return b.priority - a.priority;
      const aCat = getCategory(a.categoryId)?.order ?? 999;
      const bCat = getCategory(b.categoryId)?.order ?? 999;
      if (aCat !== bCat) return aCat - bCat;
      return Date.parse(a.createdAt) - Date.parse(b.createdAt);
    });
}
