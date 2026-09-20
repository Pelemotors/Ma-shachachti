import { apiRequest } from "./client";

export type MobileShoppingItem = {
  id: string;
  title: string;
  quantity: number;
  purchased_at: string | null;
};

export async function listShopping() {
  return apiRequest<{ shopping: MobileShoppingItem[] }>("/api/shopping");
}

export async function addShopping(title: string) {
  return apiRequest<{ shopping: MobileShoppingItem[] }>("/api/shopping", {
    method: "POST",
    body: JSON.stringify({ action: "add", title, quantity: 1 }),
  });
}

export async function toggleShopping(id: string, purchased: boolean) {
  return apiRequest<{ shopping: MobileShoppingItem[] }>("/api/shopping", {
    method: "POST",
    body: JSON.stringify({ action: "toggle", id, purchased }),
  });
}
