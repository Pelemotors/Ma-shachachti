import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  bucketForgottenDate,
  buildForgottenSurface,
  forgottenIconForTitle,
} from "../lib/forgotten-surface.ts";
import type { TaskRow } from "../lib/types.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

function task(partial: Partial<TaskRow> & Pick<TaskRow, "id" | "title" | "status">): TaskRow {
  return {
    notes: "",
    due_on: null,
    due_at: null,
    reminder_at: null,
    reminder_offset_minutes: null,
    reminder_enabled: false,
    reminder_sent_at: null,
    reminder_claimed_at: null,
    planned_start_at: null,
    planned_end_at: null,
    reschedule_count: 0,
    last_rescheduled_at: null,
    created_at: "2026-09-01T08:00:00.000Z",
    updated_at: "2026-09-01T08:00:00.000Z",
    completed_at: null,
    ...partial,
  };
}

const now = new Date("2026-09-21T10:00:00.000Z");

test("FORGOT completed items are excluded and titles are de-duplicated", () => {
  const surface = buildForgottenSurface({
    tasks: [
      task({ id: "1", title: "לקנות חלב", status: "open", due_on: "2026-09-21" }),
      task({ id: "2", title: "לקנות חלב", status: "open", due_on: "2026-09-21" }),
      task({ id: "3", title: "פדי", status: "done", due_on: "2026-09-21" }),
      task({ id: "4", title: "בוטל", status: "cancelled", due_on: "2026-09-21" }),
    ],
    now,
  });
  const titles = surface.sections.flatMap((section) => section.items.map((item) => item.title));
  assert.deepEqual(titles, ["לקנות חלב"]);
  assert.equal(titles.includes("פדי"), false);
});

test("FORGOT buckets today / this week / later from Jerusalem dates", () => {
  assert.equal(bucketForgottenDate("2026-09-20", "2026-09-21", "2026-09-26"), "today");
  assert.equal(bucketForgottenDate("2026-09-21", "2026-09-21", "2026-09-26"), "today");
  assert.equal(bucketForgottenDate("2026-09-24", "2026-09-21", "2026-09-26"), "week");
  assert.equal(bucketForgottenDate("2026-10-02", "2026-09-21", "2026-09-26"), "later");
  assert.equal(bucketForgottenDate(null, "2026-09-21", "2026-09-26"), "later");
});

test("FORGOT surface groups ranked open tasks without flooding", () => {
  const surface = buildForgottenSurface({
    tasks: [
      task({ id: "a", title: "להרים מהכביסה", status: "open", due_on: "2026-09-21" }),
      task({ id: "b", title: "לקנות חלב", status: "open", due_on: "2026-09-21" }),
      task({ id: "c", title: "לקבוע תור לרופא", status: "open", due_on: "2026-09-23" }),
      task({ id: "d", title: "טיסה לאילת", status: "open", due_on: "2026-10-10" }),
      task({ id: "e", title: "יום הולדת", status: "open", due_on: "2026-11-01" }),
      task({ id: "f", title: "לקנות בגדים", status: "open", due_on: "2026-12-01" }),
      task({ id: "g", title: "עוד משימה", status: "open", due_on: "2026-12-02" }),
    ],
    now,
  });
  const all = surface.sections.flatMap((section) => section.items);
  assert.ok(all.length <= 6);
  assert.equal(forgottenIconForTitle("לקנות חלב"), "cart");
  assert.equal(forgottenIconForTitle("לקבוע תור לרופא"), "doctor");
  assert.equal(surface.sections.find((section) => section.id === "today")?.items.length, 2);
});

test("FORGOT fixture is off in the live screen path", () => {
  const fixture = read("../apps/mobile/src/screens/forgot-v4/forgotV4Fixture.ts");
  const loader = read("../apps/mobile/src/screens/forgot-v4/useForgotV4Data.ts");
  const shell = read("../apps/mobile/src/navigation/ProductShell.tsx");
  assert.match(fixture, /FORGOT_V4_VISUAL_QA = false/);
  assert.match(loader, /FORGOT_V4_VISUAL_QA/);
  assert.match(shell, /ForgotV4Screen/);
  assert.doesNotMatch(shell, /<ForgotScreen /);
});
