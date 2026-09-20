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

export async function listChecklists() {
  return apiRequest<{ checklists: MobileChecklist[] }>("/api/checklists");
}

export async function createChecklist(title: string) {
  return apiRequest<{ checklists: MobileChecklist[] }>("/api/checklists", {
    method: "POST",
    body: JSON.stringify({ action: "create", title }),
  });
}

export async function toggleChecklistItem(
  checklistId: string,
  id: string,
  checked: boolean,
) {
  return apiRequest<{ checklists: MobileChecklist[] }>("/api/checklists", {
    method: "POST",
    body: JSON.stringify({
      action: "item.toggle",
      checklist_id: checklistId,
      id,
      checked,
    }),
  });
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
