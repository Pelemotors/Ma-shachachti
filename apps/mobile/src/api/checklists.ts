import { apiRequest } from "./client";

export type MobileChecklistItem = {
  id: string;
  text: string;
  checked: boolean;
};

export type MobileChecklist = {
  id: string;
  title: string;
  items: MobileChecklistItem[];
};

export async function listChecklists(occurrenceKey?: string) {
  const query = occurrenceKey ? `?occurrence_key=${encodeURIComponent(occurrenceKey)}` : "";
  return apiRequest<{ checklists: MobileChecklist[] }>(`/api/checklists${query}`);
}

export async function createChecklist(title: string, items: string[] = []) {
  return apiRequest<{ checklists: MobileChecklist[] }>("/api/checklists", {
    method: "POST",
    body: JSON.stringify({ action: "create", title, items }),
  });
}

async function mutate(body: Record<string, unknown>) {
  return apiRequest<{ checklists: MobileChecklist[] }>("/api/checklists", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function toggleChecklistItem(
  checklistId: string,
  id: string,
  checked: boolean,
  occurrenceKey?: string,
) {
  return mutate({
    action: "item.toggle",
    checklist_id: checklistId,
    id,
    checked,
    ...(occurrenceKey ? { occurrence_key: occurrenceKey } : {}),
  });
}

export async function renameChecklist(id: string, title: string) {
  return mutate({ action: "rename", id, title });
}

export async function deleteChecklist(id: string) {
  return mutate({ action: "delete", id });
}

export async function archiveChecklist(id: string) {
  return mutate({ action: "archive", id });
}

export async function duplicateChecklist(id: string) {
  return mutate({ action: "duplicate", id });
}

export async function resetChecklist(id: string, occurrenceKey?: string) {
  return mutate({
    action: "reset",
    id,
    ...(occurrenceKey ? { occurrence_key: occurrenceKey } : {}),
  });
}

export async function updateChecklistItem(checklistId: string, id: string, text: string) {
  return mutate({ action: "item.update", checklist_id: checklistId, id, text });
}

export async function removeChecklistItem(checklistId: string, id: string) {
  return mutate({ action: "item.remove", checklist_id: checklistId, id });
}

export async function reorderChecklistItems(checklistId: string, ids: string[]) {
  return mutate({ action: "item.reorder", checklist_id: checklistId, ids });
}

export async function addChecklistItem(checklistId: string, text: string) {
  return apiRequest<{ checklists: MobileChecklist[] }>("/api/checklists", {
    method: "POST",
    body: JSON.stringify({
      action: "item.add",
      checklist_id: checklistId,
      text,
    }),
  });
}
