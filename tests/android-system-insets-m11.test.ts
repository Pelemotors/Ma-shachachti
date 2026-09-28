import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../apps/mobile/src/", import.meta.url);

function src(rel: string) {
  return readFileSync(new URL(rel, root), "utf8");
}

test("shared SystemBottomInset exists for keyboard-hidden tab chrome", () => {
  const helper = src("layout/systemBottomInset.tsx");
  assert.match(helper, /export function SystemBottomInset/);
  assert.match(helper, /export function useBottomChromePadding/);
  assert.match(helper, /insets\.bottom/);

  assert.match(src("components/ui/TabShell.tsx"), /SystemBottomInset/);
  assert.match(src("screens/home-v4/HomeV4Screen.tsx"), /SystemBottomInset/);
  assert.match(src("screens/chat-v4/ChatV4Screen.tsx"), /SystemBottomInset/);
});

test("AppScreen footer can own system bottom inset without double-padding SafeArea", () => {
  const app = src("components/ui/AppScreen.tsx");
  assert.match(app, /footerOwnsBottomInset/);
  assert.match(app, /!includeBottomSafeArea/);
  assert.match(src("screens/ChecklistDetailScreen.tsx"), /footerOwnsBottomInset/);
});

test("Tasks editor modal uses system bottom chrome padding instead of fixed M3 workaround", () => {
  const tasks = src("screens/TasksScreen.tsx");
  assert.match(tasks, /useBottomChromePadding/);
  assert.match(tasks, /paddingBottom:\s*bottomChromePad/);
  // M3 modal workaround removed (list scroll paddingBottom: 48 may remain for tab clearance).
  assert.doesNotMatch(tasks, /modal:.*paddingBottom:\s*48/s);
  assert.doesNotMatch(tasks, /actions:.*marginBottom:\s*28/s);
});
