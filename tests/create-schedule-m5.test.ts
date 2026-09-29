import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  mergeDayPlanItems,
  resolvePlanningContext,
  replanDay,
  updateDayPlan,
  type DayPlanItemInput,
} from "../lib/day-plan.ts";
import { jerusalemDateTimeToUtc } from "../lib/time.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function stalePlanDb() {
  const state = {
    plan: {
      id: "plan-m5-stale",
      scope_type: "user",
      scope_id: "user-m5",
      plan_date: "2026-10-02",
      updated_at: "2026-10-02T07:00:00.000Z",
    },
    items: [
      {
        id: "item-old",
        day_plan_id: "plan-m5-stale",
        task_id: "task-old",
        start_at: jerusalemDateTimeToUtc("2026-10-02", "08:00").toISOString(),
        end_at: jerusalemDateTimeToUtc("2026-10-02", "08:30").toISOString(),
        kind: "fixed",
        source: "manual",
        routine_id: null,
        occurrence_key: null,
      },
    ],
  };
  let updateCount = 0;
  return {
    state,
    from(table: string) {
      let filters: Record<string, string> = {};
      let operation: "select" | "delete" | "insert" | "update" = "select";
      let payload: Record<string, unknown> = {};
      const api: Record<string, unknown> = {
        select() {
          operation = "select";
          return api;
        },
        eq(column: string, value: string) {
          filters[column] = value;
          return api;
        },
        order() {
          return api;
        },
        delete() {
          operation = "delete";
          return api;
        },
        insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
          operation = "insert";
          const list = Array.isArray(rows) ? rows : [rows];
          for (const row of list) state.items.push({ id: `item-${state.items.length + 1}`, ...row });
          return api;
        },
        update(next: Record<string, unknown>) {
          operation = "update";
          payload = next;
          return api;
        },
        async maybeSingle() {
          if (table === "day_plans") return { data: state.plan, error: null };
          return { data: null, error: null };
        },
        then(resolve: (value: { data: unknown; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
          if (operation === "delete" && table === "day_plan_items") {
            state.items.splice(0, state.items.length);
          }
          if (operation === "update" && table === "day_plans") {
            updateCount += 1;
            state.plan.updated_at = `2026-10-02T07:0${updateCount + 1}:00.000Z`;
            Object.assign(state.plan, payload);
          }
          if (table === "day_plans") return Promise.resolve({ data: state.plan, error: null }).then(resolve, reject);
          if (table === "day_plan_items") return Promise.resolve({ data: state.items, error: null }).then(resolve, reject);
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return api;
    },
  } as never;
}

test("resolvePlanningContext defaults to 07:00–19:00", () => {
  const resolved = resolvePlanningContext();
  assert.equal(resolved.windowStart, "07:00");
  assert.equal(resolved.windowEnd, "19:00");
  assert.equal(resolved.contextApplied, false);
  assert.equal(resolved.fillGaps, false);
});

test("planning context finish-early clamps window end", () => {
  const resolved = resolvePlanningContext("07:00", "19:00", "אני רוצה לסיים מוקדם");
  assert.equal(resolved.contextApplied, true);
  assert.equal(resolved.windowEnd, "15:00");
});

test("planning context evening guests clamps window end", () => {
  const resolved = resolvePlanningContext("07:00", "19:00", "יש לי אורחים בערב");
  assert.equal(resolved.contextApplied, true);
  assert.equal(resolved.windowEnd, "17:00");
});

test("planning context cancelled club enables gap fill", () => {
  const resolved = resolvePlanningContext(
    "07:00",
    "19:00",
    "החוג בוטל היום, יש לי שעה פנויה",
  );
  assert.equal(resolved.contextApplied, true);
  assert.equal(resolved.fillGaps, true);
  assert.ok(resolved.gapMinutes < 15);
});

test("gap fill places a task into a free hour before later blocks", () => {
  const existing: DayPlanItemInput[] = [
    {
      task_id: "morning",
      start_at: jerusalemDateTimeToUtc("2026-09-29", "08:00").toISOString(),
      end_at: jerusalemDateTimeToUtc("2026-09-29", "09:00").toISOString(),
      kind: "fixed",
      source: "manual",
    },
    {
      task_id: "evening",
      start_at: jerusalemDateTimeToUtc("2026-09-29", "16:00").toISOString(),
      end_at: jerusalemDateTimeToUtc("2026-09-29", "17:00").toISOString(),
      kind: "fixed",
      source: "manual",
    },
  ];
  const withoutContext = mergeDayPlanItems(
    existing,
    ["flex-new"],
    "2026-09-29",
    [],
    "07:00",
    "19:00",
  );
  const withGaps = mergeDayPlanItems(
    existing,
    ["flex-new"],
    "2026-09-29",
    [],
    "07:00",
    "19:00",
    { fillGaps: true, gapMinutes: 5 },
  );
  const appended = withoutContext.find((item) => item.task_id === "flex-new");
  const gapped = withGaps.find((item) => item.task_id === "flex-new");
  assert.ok(appended);
  assert.ok(gapped);
  // Without gaps: after evening block (~17:05). With gaps: into the free hour after morning.
  assert.ok(Date.parse(gapped!.start_at) < Date.parse(appended!.start_at));
  assert.ok(Date.parse(gapped!.start_at) < Date.parse(existing[1]!.start_at));
});

test("explicit replan reschedules an existing flexible item but keeps fixed items locked", () => {
  const existing: DayPlanItemInput[] = [
    {
      task_id: "fixed-qa",
      start_at: jerusalemDateTimeToUtc("2026-10-06", "12:00").toISOString(),
      end_at: jerusalemDateTimeToUtc("2026-10-06", "12:30").toISOString(),
      kind: "fixed",
      source: "manual",
    },
    {
      task_id: "flex-qa",
      start_at: jerusalemDateTimeToUtc("2026-10-06", "13:00").toISOString(),
      end_at: jerusalemDateTimeToUtc("2026-10-06", "13:45").toISOString(),
      kind: "flexible",
      source: "replan",
    },
  ];
  const baseline = mergeDayPlanItems(
    existing,
    ["fixed-qa", "flex-qa"],
    "2026-10-06",
    [],
    "07:00",
    "19:00",
  );
  const contextual = mergeDayPlanItems(
    existing,
    ["fixed-qa", "flex-qa"],
    "2026-10-06",
    [],
    "07:00",
    "19:00",
    { fillGaps: true, gapMinutes: 5 },
  );
  const baselineFixed = baseline.find((item) => item.task_id === "fixed-qa");
  const contextualFixed = contextual.find((item) => item.task_id === "fixed-qa");
  const baselineFlexible = baseline.find((item) => item.task_id === "flex-qa");
  const contextualFlexible = contextual.find((item) => item.task_id === "flex-qa");
  assert.ok(baselineFixed && contextualFixed && baselineFlexible && contextualFlexible);
  assert.equal(contextualFixed.start_at, baselineFixed.start_at);
  assert.notEqual(contextualFlexible.start_at, baselineFlexible.start_at);
  assert.ok(Date.parse(contextualFlexible.start_at) < Date.parse(baselineFlexible.start_at));
  assert.equal(contextual.filter((item) => item.task_id === "flex-qa").length, 1);
});

test("narrow window from context prevents packing past end", () => {
  const existing: DayPlanItemInput[] = [
    {
      task_id: "late",
      start_at: jerusalemDateTimeToUtc("2026-09-29", "14:30").toISOString(),
      end_at: jerusalemDateTimeToUtc("2026-09-29", "15:00").toISOString(),
      kind: "fixed",
      source: "manual",
    },
  ];
  const resolved = resolvePlanningContext("07:00", "19:00", "אני רוצה לסיים מוקדם");
  const merged = mergeDayPlanItems(
    existing,
    ["too-late"],
    "2026-09-29",
    [],
    resolved.windowStart,
    resolved.windowEnd,
  );
  assert.equal(
    merged.some((item) => item.task_id === "too-late"),
    false,
  );
});

test("PlanComposer stays on screen after commit and uses replanDay", () => {
  const composer = read("apps/mobile/src/screens/PlanComposerScreen.tsx");
  const shell = read("apps/mobile/src/navigation/ProductShell.tsx");
  assert.match(composer, /await replanDay\(/);
  assert.match(composer, /planningContext:\s*context\.trim/);
  assert.match(composer, /selectOpenTaskIdsForDate/);
  assert.match(composer, /DEFAULT_START = "07:00"/);
  assert.match(composer, /DEFAULT_END = "19:00"/);
  assert.match(composer, /מה חשוב \/ שונה לך היום/);
  assert.match(composer, /יום אחר/);
  assert.match(composer, /toJerusalemYmd/);
  assert.match(composer, /הלו״ז עודכן ונשמר/);
  assert.doesNotMatch(composer, /onDone\(\{\s*kind:\s*"success"/);
  assert.doesNotMatch(composer, /sendChat|תכנון עם הסוכן/);
  assert.doesNotMatch(shell, /planSuccess/);
  assert.doesNotMatch(shell, /הלו״ז מוכן/);
  assert.match(shell, /stay on Create\/Change Schedule after commit/);
});

test("PlanComposer Back dismisses the keyboard before leaving", () => {
  const composer = read("apps/mobile/src/screens/PlanComposerScreen.tsx");
  assert.match(composer, /useKeyboardOpen/);
  assert.match(
    composer,
    /if \(keyboardOpen\) \{\s*contextInputRef\.current\?\.blur\(\);\s*Keyboard\.dismiss\(\);\s*return true;/,
  );
  assert.match(composer, /ref=\{contextInputRef\}/);
  assert.match(composer, /keyboardOpen, onBack/);
});

test("PlanComposer renders the canonical routine, fixed, and flexible items", () => {
  const composer = read("apps/mobile/src/screens/PlanComposerScreen.tsx");
  assert.match(composer, /plan\?\.items\.length/);
  assert.match(composer, /plan\.items\.map\(\(item\)/);
  assert.match(composer, /itemKindLabel\(item\)/);
  assert.match(composer, /if \(item\.occurrence_key \|\| item\.routine_id\) return "שגרה"/);
  assert.match(composer, /item\.kind === "fixed" \|\| item\.source === "calendar"/);
  assert.match(composer, /return "גמיש"/);
});

test("day-plan replan route still wires planning_context into replanDay", () => {
  const route = read("app/api/day-plan/route.ts");
  const dayPlan = read("lib/day-plan.ts");
  assert.match(route, /planningContext: body\.planning_context/);
  assert.match(dayPlan, /resolvePlanningContext/);
  assert.match(dayPlan, /context_applied: resolved\.contextApplied/);
});

test("stale planUpdatedAt returns 409 without overwriting the newer canonical plan", async () => {
  const db = stalePlanDb();
  const firstUpdatedAt = db.state.plan.updated_at;
  await updateDayPlan(db, "user-m5", "2026-10-02", [
    {
      task_id: "task-new",
      start_at: jerusalemDateTimeToUtc("2026-10-02", "09:00").toISOString(),
      end_at: jerusalemDateTimeToUtc("2026-10-02", "09:30").toISOString(),
      kind: "fixed",
      source: "manual",
    },
  ]);
  const secondUpdatedAt = db.state.plan.updated_at;
  assert.notEqual(secondUpdatedAt, firstUpdatedAt);

  await assert.rejects(
    () => replanDay(db, "user-m5", "2026-10-02", [], [], false, { planUpdatedAt: firstUpdatedAt }),
    (error: unknown) => error instanceof Error && (error as { status?: number }).status === 409,
  );
  assert.equal(db.state.plan.updated_at, secondUpdatedAt);
  assert.deepEqual(db.state.items.map((item) => item.task_id), ["task-new"]);
});
