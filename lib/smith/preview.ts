import { requireExactGitSha } from "./sha.ts";

export type PreviewDeployment = {
  provider: string;
  deploymentId: string;
  url: string;
  exactSha: string;
  status:
    "preparing" | "building" | "testing" | "ready" | "failed" | "superseded";
};

export interface PreviewProvider {
  deploy(input: {
    branch: string;
    exactSha: string;
  }): Promise<PreviewDeployment>;
  getStatus(deploymentId: string): Promise<PreviewDeployment>;
  getUrl(deploymentId: string): Promise<string | null>;
}

export function validatePreviewDeployment(
  deployment: PreviewDeployment,
  expectedSha: string,
) {
  requireExactGitSha(expectedSha);
  requireExactGitSha(deployment.exactSha);
  if (deployment.exactSha !== expectedSha) {
    throw new Error("Preview SHA does not match the requested commit.");
  }
  if (
    deployment.status === "ready" &&
    !/^https:\/\/[A-Za-z0-9.-]+(?:\/.*)?$/.test(deployment.url)
  ) {
    throw new Error("A ready Preview requires an HTTPS URL.");
  }
  return deployment;
}

export class DisconnectedPreviewProvider implements PreviewProvider {
  async deploy(): Promise<never> {
    throw new Error("Preview Provider עדיין לא הוגדר.");
  }

  async getStatus(): Promise<never> {
    throw new Error("Preview Provider עדיין לא הוגדר.");
  }

  async getUrl(): Promise<never> {
    throw new Error("Preview Provider עדיין לא הוגדר.");
  }
}
