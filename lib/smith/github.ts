import { createHmac, timingSafeEqual } from "node:crypto";
import { redactOperationalData } from "./redaction.ts";

export type SmithPullRequestInput = {
  workItemId: string;
  branch: string;
  exactSha: string;
  title: string;
  body: string;
};

export interface SmithGitHubProvider {
  createWorkItemBranch(input: {
    branch: string;
    baseSha: string;
  }): Promise<{ branch: string }>;
  openPullRequest(
    input: SmithPullRequestInput,
  ): Promise<{ number: number; url: string; headSha: string }>;
}

export function verifyGitHubWebhookSignature(
  body: string,
  signatureHeader: string | null,
  secret: string,
) {
  if (!secret || !signatureHeader?.startsWith("sha256=")) return false;
  const received = Buffer.from(signatureHeader.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", secret).update(body).digest();
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

export function requireGitHubDeliveryId(value: string | null) {
  if (!value || !/^[A-Za-z0-9-]{8,100}$/.test(value)) {
    throw new Error("Invalid GitHub delivery id.");
  }
  return `github:${value}`;
}

export function sanitizeGitHubPayload(payload: unknown) {
  return redactOperationalData(payload);
}

export class DisconnectedGitHubProvider implements SmithGitHubProvider {
  async createWorkItemBranch(): Promise<never> {
    throw new Error("GitHub עדיין לא מחובר ל-Smith.");
  }

  async openPullRequest(): Promise<never> {
    throw new Error("GitHub עדיין לא מחובר ל-Smith.");
  }
}
