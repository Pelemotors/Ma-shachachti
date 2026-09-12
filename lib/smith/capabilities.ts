import type { SmithEnvironment } from "./types.ts";

export const SMITH_CAPABILITIES = [
  "read_repo",
  "read_system_events",
  "read_prod_logs",
  "read_prod_aggregates",
  "create_branch",
  "edit_preview_code",
  "commit_preview_code",
  "deploy_preview",
  "write_test_database",
  "run_tests",
  "run_browser_tests",
  "request_production_approval",
  "deploy_production",
  "write_production_database",
  "modify_production_secrets",
  "modify_branch_protection",
  "approve_own_change",
  "rollback_production",
] as const;

export type SmithCapability = (typeof SMITH_CAPABILITIES)[number];

const readCapabilities = new Set<SmithCapability>([
  "read_repo",
  "read_system_events",
  "read_prod_logs",
  "read_prod_aggregates",
]);

const previewCapabilities = new Set<SmithCapability>([
  "create_branch",
  "edit_preview_code",
  "commit_preview_code",
  "deploy_preview",
  "write_test_database",
  "run_tests",
  "run_browser_tests",
  "request_production_approval",
]);

const forbiddenCapabilities = new Set<SmithCapability>([
  "deploy_production",
  "write_production_database",
  "modify_production_secrets",
  "modify_branch_protection",
  "approve_own_change",
  "rollback_production",
]);

export type CapabilityContext = {
  environment: SmithEnvironment;
  killSwitchActive: boolean;
  githubConnected: boolean;
  testEnvironmentConnected: boolean;
  previewConnected: boolean;
};

export function evaluateSmithCapability(
  capability: SmithCapability,
  context: CapabilityContext,
): { allowed: boolean; reason: string | null } {
  if (forbiddenCapabilities.has(capability)) {
    return {
      allowed: false,
      reason: "Production operations are outside Smith's security boundary.",
    };
  }

  if (readCapabilities.has(capability)) return { allowed: true, reason: null };

  if (context.killSwitchActive) {
    return { allowed: false, reason: "Smith kill switch is active." };
  }

  if (!previewCapabilities.has(capability)) {
    return { allowed: false, reason: "Capability is not registered." };
  }

  if (
    ["create_branch", "commit_preview_code"].includes(capability) &&
    !context.githubConnected
  ) {
    return { allowed: false, reason: "GitHub is not connected." };
  }

  if (
    capability === "write_test_database" &&
    !context.testEnvironmentConnected
  ) {
    return { allowed: false, reason: "Test environment is not configured." };
  }

  if (
    ["deploy_preview", "run_browser_tests"].includes(capability) &&
    !context.previewConnected
  ) {
    return { allowed: false, reason: "Preview provider is not configured." };
  }

  if (context.environment === "production") {
    return {
      allowed: false,
      reason: "Smith capabilities cannot mutate the Production environment.",
    };
  }

  return { allowed: true, reason: null };
}

export function assertSmithCapability(
  capability: SmithCapability,
  context: CapabilityContext,
) {
  const decision = evaluateSmithCapability(capability, context);
  if (!decision.allowed)
    throw new Error(decision.reason ?? "Capability denied.");
}
