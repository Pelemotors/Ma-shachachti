import { requireExactGitSha } from "./sha.ts";

const SMITH_BRANCH =
  /^smith\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

const protectedTargets = new Set([
  "main",
  "master",
  "rebuild/lean-v1",
  "legacy/pre-lean-rebuild",
  "feature/smith-control-center",
]);

export function isSmithWorkItemBranch(branch: string) {
  return SMITH_BRANCH.test(branch);
}

export function assertSmithWorkItemBranch(branch: string) {
  if (protectedTargets.has(branch) || !isSmithWorkItemBranch(branch)) {
    throw new Error(
      "Smith may only target a smith/<work-item-id>-<slug> branch.",
    );
  }
  return branch;
}

export function validateSmithGitOperation(input: {
  baseBranch: string;
  targetBranch: string;
  baseSha: string;
}) {
  if (input.baseBranch !== "main") {
    throw new Error(
      "Smith work items must read from the protected main baseline.",
    );
  }
  assertSmithWorkItemBranch(input.targetBranch);
  requireExactGitSha(input.baseSha);
  return input;
}
