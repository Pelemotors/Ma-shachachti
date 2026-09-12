import { evidenceMatchesSha, requireExactGitSha } from "./sha.ts";
import type { SmithRisk } from "./types.ts";

export type ProductionApprovalEvidence = {
  adminUserId: string;
  smithActorId: string | null;
  workItemStatus: string;
  risk: SmithRisk;
  exactSha: string;
  pullRequestHeadSha: string;
  previewSha: string;
  testRunSha: string;
  testRunPassed: boolean;
  manualQaSha: string;
  securityReviewPassed: boolean;
  hasSupersedingCommit: boolean;
};

export function assertReauthenticationIdentity(
  currentAdminUserId: string,
  reauthenticatedUserId: string,
) {
  if (!currentAdminUserId || currentAdminUserId !== reauthenticatedUserId) {
    throw new Error("Re-authenticated identity does not match the Admin.");
  }
}

export function validateProductionApproval(
  evidence: ProductionApprovalEvidence,
) {
  requireExactGitSha(evidence.exactSha);
  const errors: string[] = [];

  if (evidence.smithActorId === evidence.adminUserId) {
    errors.push("Smith cannot approve its own change.");
  }
  if (evidence.workItemStatus !== "approval_requested") {
    errors.push("Work item is not awaiting approval.");
  }
  if (!evidenceMatchesSha(evidence.exactSha, evidence.pullRequestHeadSha)) {
    errors.push("Pull request head SHA is stale.");
  }
  if (!evidenceMatchesSha(evidence.exactSha, evidence.previewSha)) {
    errors.push("Preview evidence is stale.");
  }
  if (
    !evidence.testRunPassed ||
    !evidenceMatchesSha(evidence.exactSha, evidence.testRunSha)
  ) {
    errors.push("Passing tests for the exact SHA are required.");
  }
  if (!evidenceMatchesSha(evidence.exactSha, evidence.manualQaSha)) {
    errors.push("Manual QA for the exact SHA is required.");
  }
  if (evidence.hasSupersedingCommit) {
    errors.push("A superseding commit invalidates approval.");
  }
  if (evidence.risk === "high" && !evidence.securityReviewPassed) {
    errors.push("High-risk changes require a passing security review.");
  }

  return { approved: errors.length === 0, errors };
}

export type ProductionOperation = {
  operation:
    | "deploy_sha"
    | "apply_database_migration"
    | "change_auth_or_rls"
    | "change_infrastructure"
    | "rollback_sha";
  exactSha: string;
  workItemId: string;
  authorizationId: string;
};

export interface ProductionExecutor {
  state(): "disconnected" | "connected";
  execute(operation: ProductionOperation): Promise<never>;
}

export class DisconnectedProductionExecutor implements ProductionExecutor {
  state() {
    return "disconnected" as const;
  }

  async execute(): Promise<never> {
    throw new Error(
      "ProductionExecutor is DISCONNECTED until every external protection is verified.",
    );
  }
}
