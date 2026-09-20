import { redactValue } from "../utils/redact.ts";
import type { AdapterCallResult, ProductAdapter, ProductState } from "./product-adapter.ts";

export type HttpProductAdapterOptions = {
  baseUrl: string;
  getAccessToken?: () => string | null;
  correlationId?: string;
};

function summarizeHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = key.toLowerCase() === "authorization" ? "[REDACTED]" : value;
  });
  return out;
}

export function createHttpProductAdapter(
  options: HttpProductAdapterOptions,
): ProductAdapter {
  let token = options.getAccessToken?.() ?? null;

  async function call(
    method: string,
    path: string,
    body?: unknown,
    optionsForCall: { keepRawBody?: boolean } = {},
  ): Promise<AdapterCallResult> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
    };
    if (options.correlationId) {
      headers["x-simulation-correlation-id"] = options.correlationId;
    }
    if (token) headers.authorization = `Bearer ${token}`;
    const url = `${options.baseUrl.replace(/\/$/, "")}${path}`;
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text.slice(0, 200) };
    }
    return {
      ok: response.ok,
      status: response.status,
      body: optionsForCall.keepRawBody ? parsed : redactValue(parsed),
      requestSummary: {
        method,
        path,
        headers: { authorization: token ? "[REDACTED]" : "" },
      },
      responseSummary: {
        status: response.status,
        headers: summarizeHeaders(response.headers),
      },
    };
  }

  function actionBody(type: string, input: Record<string, unknown>) {
    return { actions: [{ type, ...input }] };
  }

  return {
    kind: "http",
    async authenticate(input) {
      const result = await call(
        "POST",
        "/api/auth/native",
        {
          email: input.email,
          password: input.password,
        },
        { keepRawBody: true },
      );
      const body = result.body as { access_token?: string; accessToken?: string } | null;
      token = body?.access_token ?? body?.accessToken ?? token;
      return {
        ...result,
        requestSummary: { ...result.requestSummary, body: "[REDACTED]" },
        body: redactValue(result.body),
      };
    },
    async logout() {
      token = null;
      return {
        ok: true,
        status: 200,
        body: { loggedOut: true },
        requestSummary: { method: "LOCAL", path: "logout" },
        responseSummary: { status: 200 },
      };
    },
    async createTask(input) {
      return call("POST", "/api/tasks", actionBody("task.create", input));
    },
    async updateTask(input) {
      return call("POST", "/api/tasks", actionBody("task.update", input));
    },
    async completeTask(input) {
      return call("POST", "/api/tasks", actionBody("task.complete", input));
    },
    async deleteTask(input) {
      return call("POST", "/api/tasks", actionBody("task.delete", input));
    },
    async listTasks() {
      return call("GET", "/api/tasks");
    },
    async sendChatMessage(input) {
      return call("POST", "/api/chat", input);
    },
    async getDayPlan(input) {
      const date = String(input.date ?? "");
      return call("GET", `/api/day-plan?date=${encodeURIComponent(date)}`);
    },
    async updateDayPlan(input) {
      return call("POST", "/api/day-plan", { mode: "update", ...input });
    },
    async replanDay(input) {
      return call("POST", "/api/day-plan", { mode: "replan", ...input });
    },
    async getForgotten() {
      return call("GET", "/api/schedule");
    },
    async getFreeTimeRecommendations() {
      return call("GET", "/api/schedule");
    },
    async createShoppingItem(input) {
      return call("POST", "/api/shopping", input);
    },
    async updateShoppingItem(input) {
      return call("POST", "/api/shopping", input);
    },
    async completeShoppingItem(input) {
      return call("POST", "/api/shopping", input);
    },
    async createChecklist(input) {
      return call("POST", "/api/checklists", input);
    },
    async updateChecklist(input) {
      return call("POST", "/api/checklists", input);
    },
    async householdAction(input) {
      return call("POST", "/api/household", input);
    },
    async calendarAction(input) {
      return call("POST", "/api/calendar", input);
    },
    async notificationAction(input) {
      return call("POST", "/api/notifications", input);
    },
    async bankJobAction(input) {
      return call("POST", "/api/jobs", input);
    },
    async fetchRelevantState(): Promise<ProductState> {
      const tasks = await call("GET", "/api/tasks");
      const body = (tasks.body ?? {}) as { tasks?: Record<string, unknown>[] };
      return {
        tasks: body.tasks ?? [],
        dayPlan: null,
        shopping: [],
        checklists: [],
        calendarConstraints: [],
        household: null,
        jobs: [],
        notifications: [],
        agentVisible: {},
      };
    },
  };
}
