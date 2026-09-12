import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { SMITH_SYSTEM_PROMPT } from "../lib/smith/prompt.ts";
import {
  assertRunnerChangedPaths,
  isRunnerInputInsideWorkspace,
  scrubRunnerEnvironment,
  validateSmithRunnerInput,
} from "../lib/smith/runner-policy.ts";

function git(args: string[], allowFailure = false) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
    env: process.env,
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`Git precondition failed: git ${args[0]}`);
  }
  return result.stdout.trim();
}

function disableAmbientGitHubPushCredential() {
  git(
    [
      "config",
      "--local",
      "--unset-all",
      "http.https://github.com/.extraheader",
    ],
    true,
  );
}

export async function runSmithJob(inputFile: string) {
  if (process.env.SMITH_RUNNER_ENABLED !== "true") {
    throw new Error("Smith Runner is DISCONNECTED.");
  }

  const workspace = realpathSync(process.cwd());
  const file = realpathSync(resolve(workspace, inputFile));
  if (!isRunnerInputInsideWorkspace(workspace, file)) {
    throw new Error("Runner input must be inside the checked-out workspace.");
  }
  const input = validateSmithRunnerInput(
    JSON.parse(readFileSync(file, "utf8")) as unknown,
  );

  if (git(["status", "--porcelain"])) {
    throw new Error("Runner requires a clean checkout.");
  }
  if (git(["branch", "--show-current"]) !== input.branch) {
    throw new Error("Runner checkout branch does not match the Work Item.");
  }
  if (git(["rev-parse", "HEAD"]) !== input.baseSha) {
    throw new Error("Runner checkout is not at the reviewed base SHA.");
  }

  disableAmbientGitHubPushCredential();
  const model = process.env.SMITH_CURSOR_MODEL || "auto";
  const apiKey = scrubRunnerEnvironment(process.env);
  if (!apiKey) throw new Error("Cursor service credential is not configured.");

  const prompt = `${SMITH_SYSTEM_PROMPT}

Work Item: ${input.workItemId}
Iteration: ${input.iteration + 1} of 3
Objective:
${input.objective}

Verified diagnosis:
${input.diagnosis}

Allowed paths:
${input.allowedPaths.map((path) => `- ${path}`).join("\n")}

Runner rules:
- Work only in the listed paths.
- Do not edit protected configuration, migrations, Auth, RLS, secrets or infrastructure.
- Do not push, open a PR, deploy or contact Production.
- Run relevant local tests.
- Finish with a concise evidence summary.`;

  const { Agent, CursorAgentError } = await import("@cursor/sdk");
  try {
    const result = await Agent.prompt(prompt, {
      apiKey,
      model: { id: model },
      local: {
        cwd: workspace,
        settingSources: [],
        autoReview: true,
      },
      tools: ["read", "edit", "grep", "glob", "ls", "shell"],
      disallowedTools: ["task", "mcp", "webSearch", "webFetch"],
      name: `Smith ${input.workItemId}`,
      idempotencyKey: `${input.workItemId}:${input.baseSha}:${input.iteration}`,
    });

    if (result.status !== "finished") {
      process.stdout.write(
        `${JSON.stringify({ status: result.status, runId: result.id })}\n`,
      );
      process.exitCode = 2;
      return;
    }

    const changedPaths = git(["diff", "--name-only", input.baseSha])
      .split(/\r?\n/)
      .filter(Boolean);
    assertRunnerChangedPaths(changedPaths, input.allowedPaths);
    process.stdout.write(
      `${JSON.stringify({
        status: "finished",
        runId: result.id,
        durationMs: result.durationMs ?? null,
        changedPaths,
        pushPerformed: false,
      })}\n`,
    );
  } catch (error) {
    if (error instanceof CursorAgentError) {
      process.stdout.write(
        `${JSON.stringify({
          status: "startup_error",
          retryable: error.isRetryable,
          code: error.code,
        })}\n`,
      );
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const inputFile = process.argv[2];
  if (!inputFile) {
    process.stderr.write(
      "Usage: smith-runner <workspace-relative-input.json>\n",
    );
    process.exitCode = 64;
  } else {
    runSmithJob(inputFile).catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "Runner failed."}\n`,
      );
      process.exitCode = 78;
    });
  }
}
