import type { SmithDashboardData, SmithSetupState } from "./types.ts";

export function smithControlEnabled() {
  return process.env.SMITH_CONTROL_ENABLED === "true";
}

export function getSmithSetupState(): SmithSetupState {
  return {
    github:
      process.env.SMITH_GITHUB_APP_CONNECTED === "true"
        ? "partial"
        : "disconnected",
    preview:
      process.env.SMITH_PREVIEW_PROVIDER_CONNECTED === "true"
        ? "partial"
        : "disconnected",
    testEnvironment:
      process.env.SMITH_REMOTE_TEST_ENVIRONMENT === "true"
        ? "partial"
        : process.env.NODE_ENV === "development"
          ? "local_only"
          : "not_configured",
    playwright:
      process.env.SMITH_PLAYWRIGHT_CONNECTED === "true"
        ? "partial"
        : "not_configured",
    productionGate: "disconnected",
  };
}

export function emptySmithDashboard(): SmithDashboardData {
  return {
    enabled: smithControlEnabled(),
    setup: getSmithSetupState(),
    summary: {
      systemHealth: null,
      activeUsers: null,
      activeIncidents: null,
      readyPreviews: null,
      pendingApprovals: null,
    },
    currentJob: null,
    observations: [],
    workItems: [],
    previews: [],
    tests: [],
    approvals: [],
    audit: [],
  };
}
