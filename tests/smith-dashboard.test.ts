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

test("Smith UI contains required empty and disconnected states", () => {
  for (const text of [
    "לא זוהו אירועים חריגים כרגע.",
    "אין Preview שמוכן לבדיקה.",
    "אין שינויים שממתינים לאישור.",
    "עדיין לא הורצה בדיקה עבור עבודה זו.",
    "אין פעילות להצגה.",
    "כתוב ל־Smith מה תרצה לבדוק, לשפר או לבנות.",
    "Preview Provider עדיין לא הוגדר.",
    "מנוע בדיקות הדפדפן עדיין לא מחובר.",
  ]) {
    assert.match(component, new RegExp(text));
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
