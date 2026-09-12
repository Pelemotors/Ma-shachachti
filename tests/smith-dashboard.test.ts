import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { emptySmithDashboard } from "../lib/smith/dashboard.ts";

const component = readFileSync(
  "components/admin/smith-control-center.tsx",
  "utf8",
);
const overviewRoute = readFileSync(
  "app/api/admin/smith/overview/route.ts",
  "utf8",
);
const workItemsRoute = readFileSync(
  "app/api/admin/smith/work-items/route.ts",
  "utf8",
);

test("Smith dashboard defaults to truthful empty values", () => {
  const dashboard = emptySmithDashboard();
  assert.equal(dashboard.summary.systemHealth, null);
  assert.equal(dashboard.summary.activeUsers, null);
  assert.equal(dashboard.summary.activeIncidents, null);
  assert.equal(dashboard.currentJob, null);
  assert.deepEqual(dashboard.observations, []);
  assert.deepEqual(dashboard.previews, []);
  assert.deepEqual(dashboard.approvals, []);
});

test("Admin Control Center uses real Admin APIs and keeps Smith off", () => {
  for (const text of [
    "ADMIN CONTROL CENTER",
    "אירועים ותקלות אחרונות",
    "Smith Agent כבוי כרגע",
    "Preview אוטונומי ו־ProductionExecutor כבויים במכוון.",
    "אין פעילות להצגה.",
    "בדיקות מערכת",
  ]) {
    assert.match(component, new RegExp(text));
  }
  for (const endpoint of [
    "/api/admin/overview",
    "/api/admin/health",
    "/api/admin/activity",
    "/api/admin/ai",
    "/api/admin/incidents",
    "/api/admin/tasks",
    "/api/admin/users",
  ]) {
    assert.match(component, new RegExp(endpoint));
  }
});

test("Smith UI has no fake completion mechanism", () => {
  assert.doesNotMatch(component, /Math\.random/);
  assert.doesNotMatch(component, /98%|2,847|18\/18/);
});

test("all Smith Admin APIs require server Admin authorization", () => {
  const setupRoute = readFileSync("app/api/admin/smith/setup/route.ts", "utf8");
  const jobsRoute = readFileSync("app/api/admin/smith/jobs/route.ts", "utf8");
  const observationsRoute = readFileSync(
    "app/api/admin/smith/observations/route.ts",
    "utf8",
  );
  assert.match(overviewRoute, /await authorizeAdmin\(req\)/);
  assert.match(workItemsRoute, /await authorizeAdmin\(req\)/);
  assert.match(setupRoute, /await authorizeAdmin\(req\)/);
  assert.match(jobsRoute, /await authorizeAdmin\(req\)/);
  assert.match(observationsRoute, /await authorizeAdmin\(req\)/);
  assert.match(overviewRoute, /emptySmithDashboard/);
  assert.match(workItemsRoute, /Smith Control Plane עדיין לא הוגדר/);
});

test("Production gate is disconnected in code, not environment-controlled", () => {
  const dashboardSource = readFileSync("lib/smith/dashboard.ts", "utf8");
  assert.match(dashboardSource, /productionGate: "disconnected"/);
  assert.doesNotMatch(dashboardSource, /SMITH_PRODUCTION_EXECUTOR/);
});
