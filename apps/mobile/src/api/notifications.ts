import { apiRequest } from "./client";

export type MobileNotification = {
  id: string;
  kind: string | null;
  title: string | null;
  body: string | null;
  route: string | null;
  created_at: string;
  opened_at: string | null;
  state?: "active" | "missed" | "snoozed" | "handled" | "cancelled";
  remind_at?: string | null;
};

export async function listNotifications() {
  return apiRequest<{ notifications: MobileNotification[] }>("/api/notifications");
}

export async function markNotificationOpened(id: string) {
  return apiRequest<{ ok: boolean }>("/api/notifications", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}

export async function actOnNotification(
  id: string,
  action:
    | { action: "handled" }
    | { action: "cancel" }
    | { action: "snooze" | "change"; until: string },
) {
  return apiRequest(`/api/notifications/${id}`, {
    method: "PATCH",
    body: JSON.stringify(action),
  });
}
