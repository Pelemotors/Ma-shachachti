import { isAbsolute, normalize, relative, sep } from "node:path";
import { assertSmithWorkItemBranch } from "./git-policy.ts";
import { requireExactGitSha } from "./sha.ts";

const protectedPaths = [
  ".github/",
  ".cursor/",
  "supabase/migrations/",
  "database/migrations/",
  "lib/server-auth.ts",
  "lib/smith/production-gate.ts",
  "vercel.json",
];

export type SmithRunnerInput = {
  workItemId: string;
  branch: string;
  baseSha: string;
  iteration: number;
  objective: string;
  diagnosis: string;
  allowedPaths: string[];
};

export function validateSmithRunnerInput(value: unknown): SmithRunnerInput {
  if (!value || typeof value !== "object") {
    throw new Error("Runner input must be an object.");
  }
  const input = value as Record<string, unknown>;
  const workItemId =
    typeof input.workItemId === "string" ? input.workItemId : "";
  const branch = typeof input.branch === "string" ? input.branch : "";
  const objective =
    typeof input.objective === "string" ? input.objective.trim() : "";
  const diagnosis =
    typeof input.diagnosis === "string" ? input.diagnosis.trim() : "";
  const allowedPaths = Array.isArray(input.allowedPaths)
    ? input.allowedPaths.filter(
        (path): path is string =>
          typeof path === "string" &&
          path.length > 0 &&
          !isAbsolute(path) &&
          !normalize(path).startsWith(`..${sep}`),
      )
    : [];

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      workItemId,
    )
  ) {
    throw new Error("Invalid Smith Work Item id.");
  }
  assertSmithWorkItemBranch(branch);
  requireExactGitSha(input.baseSha);
  if (
    !Number.isInteger(input.iteration) ||
    Number(input.iteration) < 0 ||
    Number(input.iteration) >= 3
  ) {
    throw new Error("Runner iteration must be 0, 1 or 2.");
  }
  if (!objective || objective.length > 4_000) {
    throw new Error("Invalid runner objective.");
  }
  if (!diagnosis || diagnosis.length > 8_000) {
    throw new Error("Invalid runner diagnosis.");
  }
  if (!allowedPaths.length || allowedPaths.length > 30) {
    throw new Error("Runner requires a bounded allowed-path list.");
  }

  return {
    workItemId,
    branch,
    baseSha: input.baseSha as string,
    iteration: Number(input.iteration),
    objective,
    diagnosis,
    allowedPaths,
  };
}

export function isProtectedRunnerPath(path: string) {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\/+/, "");
  return protectedPaths.some(
    (protectedPath) =>
      normalized === protectedPath.replace(/\/$/, "") ||
      normalized.startsWith(protectedPath),
  );
}

export function assertRunnerChangedPaths(
  changedPaths: string[],
  allowedPaths: string[],
) {
  for (const path of changedPaths) {
    const normalized = path.replaceAll("\\", "/");
    if (isProtectedRunnerPath(normalized)) {
      throw new Error(`Runner changed a protected path: ${normalized}`);
    }
    const allowed = allowedPaths.some((entry) => {
      const prefix = entry.replaceAll("\\", "/").replace(/\/+$/, "");
      return normalized === prefix || normalized.startsWith(`${prefix}/`);
    });
    if (!allowed) {
      throw new Error(`Runner changed a path outside its scope: ${normalized}`);
    }
  }
}

export function isRunnerInputInsideWorkspace(
  workspace: string,
  inputPath: string,
) {
  const pathFromWorkspace = relative(workspace, inputPath);
  return (
    pathFromWorkspace !== "" &&
    !pathFromWorkspace.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromWorkspace)
  );
}

export function scrubRunnerEnvironment(environment: NodeJS.ProcessEnv) {
  const preservedApiKey = environment.CURSOR_API_KEY;
  for (const key of Object.keys(environment)) {
    if (
      /(?:TOKEN|SECRET|PASSWORD|PRIVATE|SERVICE_ROLE|DATABASE_URL|SUPABASE|VERCEL|GITHUB|GH_|AWS_|AZURE_|GOOGLE_)/i.test(
        key,
      )
    ) {
      delete environment[key];
    }
  }
  delete environment.CURSOR_API_KEY;
  return preservedApiKey;
}
