export type AdminAiFailure = {
  createdAt: string;
  code: string;
  status: number | null;
  latencyMs: number | null;
  message: string | null;
  model: string | null;
};

export type AdminAiMetrics = {
  attempts: number;
  successes: number;
  failures: number;
  successRate: number | null;
  averageLatencyMs: number | null;
  medianLatencyMs: number | null;
  p95LatencyMs: number | null;
  latencySampleCount: number;
  successfulCallsWithRetry: number;
  retryMetadataSampleCount: number;
  failureCodes: Record<string, number>;
  recentFailures: AdminAiFailure[];
  models: string[];
  lastTestedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  windowDays: number;
  sampleLimit: number;
  sampleTruncated: boolean;
  latencyScope: "application_decision_preparation";
};

export type AdminIncident = {
  id: string;
  eventType: string;
  title: string;
  subsystem: "ai" | "reminders" | "push" | "auth" | "database" | "system";
  severity: "warning" | "error";
  firstSeen: string;
  lastSeen: string;
  occurrenceCount: number;
  latestCode: string | null;
  latestMessage: string | null;
  latestLatencyMs: number | null;
  status: "resolved" | "unresolved" | "unknown";
  resolutionEvidenceAt: string | null;
};

export type AdminIncidentsResponse = {
  occurrenceCount: number;
  categoryCount: number;
  unresolvedCount: number;
  incidents: AdminIncident[];
  windowDays: number;
  sampleLimit: number;
  sampleTruncated: boolean;
  generatedAt: string;
};

export type OperationalEvent = {
  id: string | number;
  event_type: string;
  created_at: string;
  owner_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AdminOverview = {
  stats: {
    users: number;
    approved: number;
    pending: number;
    active7: number;
    tasks: number;
    completed: number;
    ai7: number;
    aiAttempts7: number;
    aiFailures7: number;
    aiAverageLatencyMs: number | null;
    reminders7: number;
    reminderErrors: number;
  };
  series: Array<{
    date: string;
    events: number;
    ai: number;
    aiFailures: number;
  }>;
  recent: OperationalEvent[];
  generatedAt: string;
};

export type AdminHealth = {
  database: "healthy" | "error";
  latencyMs: number;
  services: {
    supabase: boolean;
    openai: boolean;
    push: boolean;
    cron: boolean;
  };
  serviceDetails: Record<
    "supabase" | "openai" | "push" | "cron",
    {
      configured: boolean;
      status: string;
      lastTestedAt?: string | null;
      lastRunAt?: string | null;
      lastFailureCode?: string | null;
    }
  >;
  checkedAt: string;
};

export type AdminTasks = {
  total: number;
  byStatus: Record<string, number>;
  byCategory?: Record<string, number>;
};

export type AdminUser = {
  id: string;
  email: string;
  emailConfirmed: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  role: "user" | "admin";
  approved: boolean;
};

export type AdminUsers = { users: AdminUser[] };

export type TestEvidence = {
  phase1a?: {
    status: string;
    environment: string;
    generatedAt: string;
    productionConnected: boolean;
  };
  playwright?: {
    status: string;
    environment: string;
    executedAt: string;
    results: { passed: number; skipped: number; failed: number };
    sourceState: string;
    approvalEvidence: boolean;
  };
};
