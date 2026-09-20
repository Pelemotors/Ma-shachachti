export type AdapterCallResult = {
  ok: boolean;
  status: number;
  body: unknown;
  requestSummary: Record<string, unknown>;
  responseSummary: Record<string, unknown>;
};

export type ProductState = {
  tasks: Record<string, unknown>[];
  dayPlan: Record<string, unknown> | null;
  shopping: Record<string, unknown>[];
  checklists: Record<string, unknown>[];
  calendarConstraints: Record<string, unknown>[];
  household: Record<string, unknown> | null;
  jobs: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  agentVisible: Record<string, unknown>;
};

export type ProductAdapter = {
  kind: "http" | "in_memory";
  authenticate(input: Record<string, unknown>): Promise<AdapterCallResult>;
  logout(): Promise<AdapterCallResult>;
  createTask(input: Record<string, unknown>): Promise<AdapterCallResult>;
  updateTask(input: Record<string, unknown>): Promise<AdapterCallResult>;
  completeTask(input: Record<string, unknown>): Promise<AdapterCallResult>;
  deleteTask(input: Record<string, unknown>): Promise<AdapterCallResult>;
  listTasks(): Promise<AdapterCallResult>;
  sendChatMessage(input: Record<string, unknown>): Promise<AdapterCallResult>;
  getDayPlan(input: Record<string, unknown>): Promise<AdapterCallResult>;
  updateDayPlan(input: Record<string, unknown>): Promise<AdapterCallResult>;
  replanDay(input: Record<string, unknown>): Promise<AdapterCallResult>;
  getForgotten(input?: Record<string, unknown>): Promise<AdapterCallResult>;
  getFreeTimeRecommendations(
    input?: Record<string, unknown>,
  ): Promise<AdapterCallResult>;
  createShoppingItem(input: Record<string, unknown>): Promise<AdapterCallResult>;
  updateShoppingItem(input: Record<string, unknown>): Promise<AdapterCallResult>;
  completeShoppingItem(input: Record<string, unknown>): Promise<AdapterCallResult>;
  createChecklist(input: Record<string, unknown>): Promise<AdapterCallResult>;
  updateChecklist(input: Record<string, unknown>): Promise<AdapterCallResult>;
  householdAction(input: Record<string, unknown>): Promise<AdapterCallResult>;
  calendarAction(input: Record<string, unknown>): Promise<AdapterCallResult>;
  notificationAction(input: Record<string, unknown>): Promise<AdapterCallResult>;
  bankJobAction(input: Record<string, unknown>): Promise<AdapterCallResult>;
  fetchRelevantState(): Promise<ProductState>;
};
