import { apiRequest } from "./client";

export type MobileShoppingItem = {
  id: string;
  title: string;
  quantity: number;
  purchased_at: string | null;
  notes: string;
  category: string;
};

export async function listShopping() {
  return apiRequest<{ shopping: MobileShoppingItem[] }>("/api/shopping");
}

export async function addShopping(title: string, notes = "") {
  return apiRequest<{ shopping: MobileShoppingItem[] }>("/api/shopping", {
    method: "POST",
    body: JSON.stringify({ action: "add", title, notes, quantity: 1 }),
  });
}

export async function updateShopping(id: string, patch: { title?: string; notes?: string }) {
  return apiRequest<{ shopping: MobileShoppingItem[] }>("/api/shopping", {
    method: "POST",
    body: JSON.stringify({ action: "update", id, ...patch }),
  });
}

export async function toggleShopping(id: string, purchased: boolean) {
  return apiRequest<{ shopping: MobileShoppingItem[] }>("/api/shopping", {
    method: "POST",
    body: JSON.stringify({ action: "toggle", id, purchased }),
  });
}

export async function removeShopping(id: string) {
  return apiRequest<{ shopping: MobileShoppingItem[] }>("/api/shopping", {
    method: "POST",
    body: JSON.stringify({ action: "remove", id }),
  });
}
