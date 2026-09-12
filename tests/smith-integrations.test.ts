import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertSmithWorkItemBranch,
  validateSmithGitOperation,
} from "../lib/smith/git-policy.ts";
import {
  DisconnectedGitHubProvider,
  requireGitHubDeliveryId,
  verifyGitHubWebhookSignature,
} from "../lib/smith/github.ts";
import {
  DisconnectedPreviewProvider,
  validatePreviewDeployment,
} from "../lib/smith/preview.ts";
import {
  assertReauthenticationIdentity,
  DisconnectedProductionExecutor,
  validateProductionApproval,
} from "../lib/smith/production-gate.ts";

const sha = "a".repeat(40);
const workItemId = "123e4567-e89b-42d3-a456-426614174000";
const smithBranch = `smith/${workItemId}-fix-reminder`;

test("Smith Git policy cannot target main or the current build branch", () => {
  assert.throws(() => assertSmithWorkItemBranch("main"));
  assert.throws(() =>
    assertSmithWorkItemBranch("feature/smith-control-center"),
  );
  assert.equal(assertSmithWorkItemBranch(smithBranch), smithBranch);
  assert.deepEqual(
    validateSmithGitOperation({
      baseBranch: "main",
      targetBranch: smithBranch,
      baseSha: sha,
    }),
    { baseBranch: "main", targetBranch: smithBranch, baseSha: sha },
  );
});

test("GitHub webhook signatures and deliveries are verified", () => {
  const body = '{"action":"opened"}';
  const secret = "local-test-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(verifyGitHubWebhookSignature(body, signature, secret), true);
  assert.equal(
    verifyGitHubWebhookSignature(`${body}x`, signature, secret),
    false,
  );
  assert.equal(
    requireGitHubDeliveryId("123e4567-e89b-12d3-a456-426614174000"),
    "github:123e4567-e89b-12d3-a456-426614174000",
  );
  assert.throws(() => requireGitHubDeliveryId("../bad"));
});

test("disconnected GitHub and Preview providers cannot mutate", async () => {
  const github = new DisconnectedGitHubProvider();
  const preview = new DisconnectedPreviewProvider();
  await assert.rejects(() =>
    github.createWorkItemBranch({ branch: smithBranch, baseSha: sha }),
  );
  await assert.rejects(() =>
    preview.deploy({ branch: smithBranch, exactSha: sha }),
  );
});

test("Preview evidence is locked to exact SHA", () => {
  assert.throws(() =>
    validatePreviewDeployment(
      {
        provider: "test",
        deploymentId: "one",
        url: "https://preview.example.test",
        exactSha: "b".repeat(40),
        status: "ready",
      },
      sha,
    ),
  );
});

test("Production approval rejects stale evidence and Smith self-approval", () => {
  const result = validateProductionApproval({
    adminUserId: "same-actor",
    smithActorId: "same-actor",
    workItemStatus: "approval_requested",
    risk: "high",
    exactSha: sha,
    pullRequestHeadSha: sha,
    previewSha: "b".repeat(40),
    testRunSha: sha,
    testRunPassed: true,
    manualQaSha: sha,
    securityReviewPassed: false,
    hasSupersedingCommit: false,
  });
  assert.equal(result.approved, false);
  assert.equal(result.errors.length, 3);
});

test("Production re-auth identity mismatch is denied", () => {
  assert.doesNotThrow(() => assertReauthenticationIdentity("admin", "admin"));
  assert.throws(() => assertReauthenticationIdentity("admin", "other"));
});

test("Production executor remains disconnected and unusable", async () => {
  const executor = new DisconnectedProductionExecutor();
  assert.equal(executor.state(), "disconnected");
  await assert.rejects(() =>
    executor.execute({
      operation: "deploy_sha",
      exactSha: sha,
      workItemId,
      authorizationId: "authorization",
    }),
  );
});

test("webhook route has no unverified fallback", () => {
  const route = readFileSync("app/api/smith/github/webhook/route.ts", "utf8");
  assert.match(route, /verifyGitHubWebhookSignature/);
  assert.match(route, /x-github-delivery/);
  assert.match(route, /Smith Control Plane עדיין לא הוגדר/);
  assert.doesNotMatch(route, /process\.env\.GITHUB_TOKEN/);
});
