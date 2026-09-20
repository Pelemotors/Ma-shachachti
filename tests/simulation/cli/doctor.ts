import { execSync } from "node:child_process";
import { accessSync, mkdirSync, constants } from "node:fs";
import { join } from "node:path";
import { parseEnvironment, isProductionTarget } from "../config/environments.ts";
import { collectPublicSecretLeaks } from "../config/safety.ts";

type Check = { name: string; status: "PASS" | "WARNING" | "FAIL"; detail: string };

function check(name: string, ok: boolean, detail: string, warning = false): Check {
  return { name, status: ok ? "PASS" : warning ? "WARNING" : "FAIL", detail };
}

function git(cmd: string): string {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

export function runDoctor(): Check[] {
  const os = process.env.OS ?? process.platform;
  const root = git("git rev-parse --show-toplevel");
  const sha = git("git rev-parse HEAD");
  const env = parseEnvironment(process.env.SIMULATION_ENV);
  const resultsDir = process.env.SIMULATION_RESULTS_DIR ?? "test-results/simulation";
  mkdirSync(resultsDir, { recursive: true });
  let writable = true;
  try {
    accessSync(resultsDir, constants.W_OK);
  } catch {
    writable = false;
  }
  const publicFields = {
    SIMULATION_ENV: process.env.SIMULATION_ENV,
    SIMULATION_API_BASE_URL: process.env.SIMULATION_API_BASE_URL,
    SIMULATION_SEED: process.env.SIMULATION_SEED,
    SIMULATION_TIMEZONE: process.env.SIMULATION_TIMEZONE,
  };
  const leaks = collectPublicSecretLeaks(publicFields);
  return [
    check("windows_local", /win/i.test(os), `OS=${os}`),
    check("git_repo", Boolean(root), root),
    check("git_sha", sha.length >= 7, sha),
    check("node_version", Number(process.versions.node.split(".")[0]) >= 22, process.versions.node),
    check("target_environment", !isProductionTarget(env), `env=${env}`),
    check("results_writable", writable, join(root, resultsDir)),
    check("public_secret_fields", leaks.length === 0, leaks.join(",") || "none"),
  ];
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("doctor.ts")) {
  const checks = runDoctor();
  for (const row of checks) {
    console.log(`${row.status.padEnd(7)} ${row.name} — ${row.detail}`);
  }
  if (checks.some((row) => row.status === "FAIL")) process.exit(1);
}
