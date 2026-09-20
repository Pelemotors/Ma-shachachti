import type { AdapterCallResult, ProductAdapter, ProductState } from "./product-adapter.ts";

function ok(kind: string, body: unknown = {}): AdapterCallResult {
  return {
    ok: true,
    status: 200,
    body,
    requestSummary: { kind },
    responseSummary: { ok: true },
  };
}

export function createInMemoryHarnessAdapter(): ProductAdapter {
  const tasks: Record<string, unknown>[] = [];
  const shopping: Record<string, unknown>[] = [];
  const checklists: Record<string, unknown>[] = [];
  let authenticated = false;

  return {
    kind: "in_memory",
    async authenticate() {
      authenticated = true;
      return ok("authenticate", { authenticated: true });
    },
    async logout() {
      authenticated = false;
      return ok("logout", { authenticated });
    },
    async createTask(input) {
      const task = {
        id: `mem-task-${tasks.length + 1}`,
        title: String(input.title ?? "task"),
        status: "open",
      };
      tasks.push(task);
      return ok("createTask", { task });
    },
    async updateTask(input) {
      return ok("updateTask", input);
    },
    async completeTask(input) {
      const task = tasks.find((row) => row.id === input.id);
      if (task) task.status = "done";
      return ok("completeTask", { id: input.id });
    },
    async deleteTask(input) {
      const index = tasks.findIndex((row) => row.id === input.id);
      if (index >= 0) tasks.splice(index, 1);
      return ok("deleteTask", { id: input.id });
    },
    async listTasks() {
      return ok("listTasks", { tasks: [...tasks] });
    },
    async sendChatMessage(input) {
      return ok("sendChatMessage", { echo: input.message ?? "" });
    },
    async getDayPlan() {
      return ok("getDayPlan", { items: [] });
    },
    async updateDayPlan(input) {
      return ok("updateDayPlan", input);
    },
    async replanDay(input) {
      return ok("replanDay", input);
    },
    async getForgotten() {
      return ok("getForgotten", { items: [] });
    },
    async getFreeTimeRecommendations() {
      return ok("getFreeTimeRecommendations", { windows: [] });
    },
    async createShoppingItem(input) {
      const item = { id: `mem-shop-${shopping.length + 1}`, ...input };
      shopping.push(item);
      return ok("createShoppingItem", { item });
    },
    async updateShoppingItem(input) {
      return ok("updateShoppingItem", input);
    },
    async completeShoppingItem(input) {
      return ok("completeShoppingItem", input);
    },
    async createChecklist(input) {
      const item = { id: `mem-list-${checklists.length + 1}`, ...input };
      checklists.push(item);
      return ok("createChecklist", { item });
    },
    async updateChecklist(input) {
      return ok("updateChecklist", input);
    },
    async householdAction(input) {
      return ok("householdAction", input);
    },
    async calendarAction(input) {
      return ok("calendarAction", input);
    },
    async notificationAction(input) {
      return ok("notificationAction", input);
    },
    async bankJobAction(input) {
      return ok("bankJobAction", input);
    },
    async fetchRelevantState(): Promise<ProductState> {
      return {
        tasks: [...tasks],
        dayPlan: null,
        shopping: [...shopping],
        checklists: [...checklists],
        calendarConstraints: [],
        household: null,
        jobs: [],
        notifications: [],
        agentVisible: { authenticated },
      };
    },
  };
}
