import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("AI latency documents and computes successful decision preparation", () => {
  const aiRoute = read("app/api/admin/ai/route.ts");
  assert.match(aiRoute, /daysAgoIso\(30\)/);
  assert.match(
    aiRoute,
    /const latencies = successes[\s\S]*metadata[\s\S]*latencyMs/,
  );
  assert.match(aiRoute, /medianLatencyMs: percentile\(latencies, 0\.5\)/);
  assert.match(aiRoute, /latencies\.length >= 20/);
  assert.match(aiRoute, /latencySampleCount: latencies\.length/);
  assert.match(aiRoute, /successfulCallsWithRetry/);
  assert.match(aiRoute, /latencyScope: "application_decision_preparation"/);
});

test("incident API returns historical failures with resolution evidence", () => {
  const route = read("app/api/admin/incidents/route.ts");
  const incidents = read("lib/admin-incidents.ts");
  assert.match(route, /await authorizeAdmin\(req\)/);
  assert.match(incidents, /\.like\("event_type", "%\.failure"\)/);
  assert.match(incidents, /resolutionEvidenceAt/);
  assert.match(incidents, /occurrenceCount/);
  assert.match(incidents, /firstSeen/);
  assert.match(incidents, /lastSeen/);
  assert.doesNotMatch(incidents, /\.insert\(|\.update\(|\.delete\(/);
});

test("activity details are redacted before reaching the Admin UI", () => {
  const activity = read("app/api/admin/activity/route.ts");
  assert.match(activity, /owner_id,metadata/);
  assert.match(activity, /redactOperationalData\(event\.metadata/);
});

test("Control Center exposes interactive truthful operational UX", () => {
  const component = read("components/admin/smith-control-center.tsx");
  const drawer = read("components/admin/operational-detail-drawer.tsx");
  const events = read("components/admin/operational-events-panel.tsx");
  assert.match(component, /תקלות אחרונות/);
  assert.match(component, /זמן הכנת החלטת AI/);
  assert.match(component, /Smith Agent כבוי כרגע/);
  assert.match(component, /OFF — deliberate/);
  assert.match(component, /onClick=\{\(\) => onOpen\(card\.target\)\}/);
  assert.match(drawer, /role="dialog"/);
  assert.match(drawer, /latency מודד הכנת החלטה בצד השרת/);
  assert.match(events, /חיפוש לפי סוג אירוע/);
  assert.match(events, /aria-pressed/);
});

test("legacy Smith routes stay reachable as disconnected pages", () => {
  const route = read("app/admin/smith/[section]/page.tsx");
  const sections = read("lib/admin-control-sections.ts");
  const component = read("components/admin/smith-control-center.tsx");
  assert.match(route, /isAdminControlSection/);
  assert.match(sections, /previews/);
  assert.match(sections, /approvals/);
  assert.match(sections, /rollback/);
  assert.match(component, /לא הוגדר עדיין/);
  assert.match(component, /DisconnectedCapabilityPanel/);
});
