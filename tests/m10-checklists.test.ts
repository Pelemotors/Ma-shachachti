import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checklistMutationSchema } from "../lib/lists.ts";
import { withRunChecks } from "../lib/checklist-runs.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const uuid = (last: string) => `00000000-0000-4000-8000-00000000000${last}`;

test("M10 reset clears execution without changing the reusable template", () => {
  const template = [
    { id: uuid("1"), text: "פריט ראשון", checked: false },
    { id: uuid("2"), text: "פריט שני", checked: false },
  ];
  const completed = withRunChecks(template, new Set(template.map((item) => item.id)));
  const reset = withRunChecks(template, new Set<string>());

  assert.deepEqual(completed.map((item) => item.checked), [true, true]);
  assert.deepEqual(reset.map((item) => item.checked), [false, false]);
  assert.deepEqual(template.map((item) => item.checked), [false, false]);
  assert.match(read("../lib/lists.ts"), /resetChecklistRun\(db, userId, input\.id/);
});

test("M10 duplicate copies independent template items and does not copy run completion", () => {
  const lists = read("../lib/lists.ts");
  assert.match(lists, /title: `\$\{source\.title\} \(עותק\)`/);
  assert.match(lists, /checked: false/);
  assert.match(lists, /sourceItems\.map\(\(item\) => \(\{ user_id: userId, checklist_id: created\.id/);
  assert.doesNotMatch(lists, /duplicate[\s\S]{0,120}checklist_runs/);
});

test("M10 reorder, archive, and delete remain owner-scoped domain mutations", () => {
  const lists = read("../lib/lists.ts");
  assert.equal(checklistMutationSchema.safeParse({ action: "reorder", ids: [uuid("1"), uuid("2")] }).success, true);
  assert.equal(checklistMutationSchema.safeParse({ action: "item.reorder", checklist_id: uuid("1"), ids: [uuid("2")] }).success, true);
  assert.match(lists, /applyOrder\(db, "checklists", userId, input\.ids\)/);
  assert.match(lists, /archived_at: now/);
  assert.match(lists, /\.delete\(\)\.eq\("user_id", userId\)\.eq\("id", input\.id\)/);
});

test("M10 item ordering is persisted through order_index updates", () => {
  const lists = read("../lib/lists.ts");
  assert.match(lists, /update\(\{ order_index, updated_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(lists, /input\.action === "item\.reorder"/);
});

test("M3 task-linked checklists still use checklist_id and occurrence-aware runs", () => {
  const tasks = read("../apps/mobile/src/screens/TasksScreen.tsx");
  const shell = read("../apps/mobile/src/navigation/ProductShell.tsx");
  const migration = read("../database/migrations/20260926_tasks_routines_checklist_runs.sql");
  assert.match(tasks, /checklist_id/);
  assert.match(tasks, /onOpenChecklist\?\.\(checklistId, undefined\)/);
  assert.match(shell, /onOpenChecklist=\{\(id, occurrenceKey\)/);
  assert.match(migration, /checklist_id uuid references public\.checklists\(id\) on delete set null/);
});

test("M10 creation modal keeps its state when Android Back dismisses the keyboard", () => {
  const screen = read("../apps/mobile/src/screens/ChecklistsScreen.tsx");
  assert.match(screen, /if \(keyboardVisible\)[\s\S]{0,180}Keyboard\.dismiss\(\)/);
  assert.match(screen, /if \(keyboardVisible\)[\s\S]{0,260}return;[\s\S]{0,80}setOpen\(false\)/);
  assert.match(screen, /await createChecklist\(name, rows\)/);
});
