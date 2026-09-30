const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseNotificationRoute(route: string) {
  try {
    const params = new URL(route, "https://mashachachti.co.il").searchParams;
    const view = params.get("view");
    const pairs = [
      ["task", "tasks", "taskId"],
      ["shopping", "shopping", "shoppingId"],
      ["checklist", "checklists", "checklistId"],
      ["notification", "notifications", "notificationId"],
    ] as const;
    const pair = pairs.find((item) => item[1] === view && UUID_RE.test(params.get(item[0]) ?? ""));
    return pair ? { view: pair[1], [pair[2]]: params.get(pair[0]) } : null;
  } catch {
    return null;
  }
}
