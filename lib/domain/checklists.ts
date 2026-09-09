/**
 * Personal Checklists — reusable lists, separate from Task.steps.
 * Domain stores and validates structure only. Titles/items are opaque text.
 * No checklist-type taxonomy. Matching by title/keywords is forbidden here.
 */
import type { Action, AppState, Checklist, ChecklistItem } from "@/lib/model";

export const PERSONAL_CHECKLIST_FULL_CONTEXT_LIMIT = 8;
export const PERSONAL_CHECKLIST_INDEX_LIMIT = 100;
export const PERSONAL_CHECKLIST_MAX_ITEMS = 80;

function checklist(state: AppState, id: string) {
  const found = state.checklists.find((row) => row.id === id);
  if (!found) throw new Error("הצ׳קליסט לא נמצא.");
  return found;
}

function reindex(items: ChecklistItem[]) {
  return items
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index }));
}

function itemFromInput(
  input: { id?: string; text: string; checked?: boolean; order?: number },
  stamp: string,
  fallbackOrder: number,
): ChecklistItem {
  return {
    id: input.id ?? crypto.randomUUID(),
    text: input.text.trim(),
    checked: Boolean(input.checked),
    order: input.order ?? fallbackOrder,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

export function checklistIndexEntry(row: Checklist) {
  return {
    id: row.id,
    title: row.title,
    itemCount: row.items.length,
    updatedAt: row.updatedAt,
  };
}

export function applyChecklistAction(
  state: AppState,
  action: Action,
  stamp: string,
) {
  switch (action.type) {
    case "checklist.create": {
      if (state.checklists.length >= PERSONAL_CHECKLIST_INDEX_LIMIT)
        throw new Error("הגעת למספר הצ׳קליסטים המרבי.");
      const id = action.id ?? crypto.randomUUID();
      if (state.checklists.some((row) => row.id === id))
        throw new Error("כבר יש צ׳קליסט עם המזהה הזה.");
      const items = reindex(
        (action.items ?? []).map((item, index) =>
          itemFromInput(item, stamp, index),
        ),
      );
      state.checklists.push({
        id,
        title: action.title.trim(),
        items,
        createdAt: stamp,
        updatedAt: stamp,
      });
      return;
    }
    case "checklist.update": {
      const row = checklist(state, action.id);
      row.title = action.title.trim();
      row.updatedAt = stamp;
      return;
    }
    case "checklist.delete": {
      checklist(state, action.id);
      state.checklists = state.checklists.filter((row) => row.id !== action.id);
      return;
    }
    case "checklist.item.add": {
      const row = checklist(state, action.checklistId);
      if (row.items.length >= PERSONAL_CHECKLIST_MAX_ITEMS)
        throw new Error("הגעת למספר הפריטים המרבי בצ׳קליסט.");
      const id = action.itemId ?? crypto.randomUUID();
      if (row.items.some((item) => item.id === id))
        throw new Error("כבר יש פריט עם המזהה הזה.");
      const order = action.order ?? row.items.length;
      row.items = reindex([
        ...row.items,
        itemFromInput(
          { id, text: action.text, checked: action.checked, order },
          stamp,
          order,
        ),
      ]);
      row.updatedAt = stamp;
      return;
    }
    case "checklist.item.update": {
      const row = checklist(state, action.checklistId);
      const item = row.items.find((entry) => entry.id === action.itemId);
      if (!item) throw new Error("הפריט בצ׳קליסט לא נמצא.");
      item.text = action.text.trim();
      item.updatedAt = stamp;
      row.updatedAt = stamp;
      return;
    }
    case "checklist.item.remove": {
      const row = checklist(state, action.checklistId);
      if (!row.items.some((item) => item.id === action.itemId))
        throw new Error("הפריט בצ׳קליסט לא נמצא.");
      row.items = reindex(row.items.filter((item) => item.id !== action.itemId));
      row.updatedAt = stamp;
      return;
    }
    case "checklist.item.reorder": {
      const row = checklist(state, action.checklistId);
      if (action.itemIds.length !== row.items.length)
        throw new Error("סדר הפריטים חייב לכלול את כל הפריטים הקיימים.");
      const byId = new Map(row.items.map((item) => [item.id, item]));
      const next: ChecklistItem[] = [];
      const seen = new Set<string>();
      for (const id of action.itemIds) {
        const item = byId.get(id);
        if (!item || seen.has(id))
          throw new Error("סדר הפריטים אינו תואם לצ׳קליסט.");
        seen.add(id);
        next.push({ ...item, order: next.length, updatedAt: stamp });
      }
      row.items = next;
      row.updatedAt = stamp;
      return;
    }
    case "checklist.item.toggle": {
      const row = checklist(state, action.checklistId);
      const item = row.items.find((entry) => entry.id === action.itemId);
      if (!item) throw new Error("הפריט בצ׳קליסט לא נמצא.");
      item.checked = action.checked;
      item.updatedAt = stamp;
      row.updatedAt = stamp;
      return;
    }
    case "checklist.reset": {
      const row = checklist(state, action.id);
      for (const item of row.items) {
        item.checked = false;
        item.updatedAt = stamp;
      }
      row.updatedAt = stamp;
      return;
    }
    default:
      return;
  }
}
