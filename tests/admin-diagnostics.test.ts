import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isAdminDiagnosticCheck,
  summarizeAdminApiResponses,
} from "../lib/admin-diagnostic-contract.ts";

test("diagnostic names are a closed allowlist", () => {
  for (const check of [
    "database",
    "auth",
    "admin-apis",
    "openai",
    "storage",
    "push-reminders",
    "full-health",
    "unit-tests",
    "playwright",
  ]) {
    assert.equal(isAdminDiagnosticCheck(check), true, check);
  }
  assert.equal(isAdminDiagnosticCheck("shell"), false);
  assert.equal(isAdminDiagnosticCheck("../unit-tests"), false);
});

test("Admin API diagnostic fails if any real endpoint fails", () => {
  const passed = summarizeAdminApiResponses([
    { name: "overview", status: 200, ok: true },
    { name: "health", status: 200, ok: true },
  ]);
  assert.equal(passed.status, "pass");

  const failed = summarizeAdminApiResponses([
    { name: "overview", status: 200, ok: true },
    { name: "health", status: 503, ok: false },
  ]);
  assert.equal(failed.status, "fail");
  assert.match(failed.summary, /1 ממשקי Admin/);
});

test("diagnostic route is Admin-only and does not accept commands", () => {
  const route = readFileSync(
    "app/api/admin/diagnostics/[check]/route.ts",
    "utf8",
  );
  const diagnostics = readFileSync("lib/admin-diagnostics.ts", "utf8");
  assert.match(route, /authorizeAdmin\(req\)/);
  assert.match(route, /isAdminDiagnosticCheck\(check\)/);
  assert.match(route, /inFlightChecks\.has\(key\)/);
  assert.match(route, /inFlightChecks\.delete\(key\)/);
  assert.doesNotMatch(route, /req\.json|searchParams.*command|body\.command/);
  assert.match(diagnostics, /process\.env\.NODE_ENV !== "development"/);
  assert.match(diagnostics, /execFileAsync\(process\.execPath, args/);
  assert.match(diagnostics, /entry\.name\.endsWith\("\.test\.ts"\)/);
  assert.doesNotMatch(diagnostics, /exec\(|shell:\s*true/);
});

test("Control Center core data no longer depends on Smith enablement", () => {
  const component = readFileSync(
    "components/admin/smith-control-center.tsx",
    "utf8",
  );
  assert.match(component, /"\/api\/admin\/overview"/);
  assert.match(component, /"\/api\/admin\/health"/);
  assert.match(component, /"\/api\/admin\/incidents"/);
  assert.match(component, /Smith Agent כבוי כרגע/);
  assert.doesNotMatch(component, /if \(!dashboard\.enabled\)/);
  assert.doesNotMatch(component, /<ChatPanel enabled=/);
});
