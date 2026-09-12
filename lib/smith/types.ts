export const SMITH_WORK_ITEM_STATUSES = [
  "detected",
  "investigating",
  "building",
  "testing",
  "preview_ready",
  "approval_requested",
  "approved",
  "deploying",
  "deployed",
  "rejected",
  "blocked",
  "failed",
  "superseded",
  "verification_failed",
  "rollback_ready",
] as const;

export type SmithWorkItemStatus = (typeof SMITH_WORK_ITEM_STATUSES)[number];
export type SmithRisk = "low" | "medium" | "high";
export type SmithEnvironment = "production" | "preview" | "test" | "local";
export type SmithConnectionState =
  | "connected"
  | "disconnected"
  | "partial"
  | "blocked"
  | "not_configured"
  | "local_only";

export type SmithWorkItem = {
  id: string;
  title: string;
  description: string;
  source: string;
  severity: "info" | "warning" | "error" | "critical";
  status: SmithWorkItemStatus;
  risk_level: SmithRisk;
  hypothesis: string | null;
  diagnosis: string | null;
  solution_summary: string | null;
  branch_name: string | null;
  commit_sha: string | null;
  current_preview_id: string | null;
  created_at: string;
  updated_at: string;
};

export type SmithObservation = {
  id: string;
  work_item_id: string | null;
  event_name: string;
  source: string;
  environment: SmithEnvironment;
  severity: "info" | "warning" | "error" | "critical" | "success";
  title: string;
  summary: string;
  evidence: Record<string, unknown>;
  metrics: Record<string, unknown>;
  observed_at: string;
};

export type SmithSetupState = {
  github: SmithConnectionState;
  preview: SmithConnectionState;
  testEnvironment: SmithConnectionState;
  playwright: SmithConnectionState;
  productionGate: SmithConnectionState;
};

export type SmithDashboardSummary = {
  systemHealth: number | null;
  activeUsers: number | null;
  activeIncidents: number | null;
  readyPreviews: number | null;
  pendingApprovals: number | null;
};

export type SmithDashboardData = {
  enabled: boolean;
  setup: SmithSetupState;
  summary: SmithDashboardSummary;
  currentJob: null | {
    id: string;
    status: string;
    jobType: string;
    workItemId: string | null;
  };
  observations: SmithObservation[];
  workItems: SmithWorkItem[];
  previews: unknown[];
  tests: unknown[];
  approvals: unknown[];
  audit: unknown[];
};
