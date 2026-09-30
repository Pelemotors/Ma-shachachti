import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("M13 Quick Task uses the canonical Task API and closes only after success", () => {
  const screen = read("../apps/mobile/src/screens/chat-v4/ChatV4Screen.tsx");
  const tasks = read("../apps/mobile/src/api/tasks.ts");
  assert.match(screen, /import \{ createChatSession, loadChat, sendChat \}/);
  assert.match(screen, /await createTask\(title\)/);
  assert.match(screen, /setAddingTask\(false\)/);
  assert.match(screen, /catch \(err\)/);
  assert.match(tasks, /type: "task\.create"/);
  assert.doesNotMatch(screen, /fetch\([^)]*tasks/);
});

test("M13 Build Schedule opens the existing PlanComposer flow", () => {
  const screen = read("../apps/mobile/src/screens/chat-v4/ChatV4Screen.tsx");
  const shell = read("../apps/mobile/src/navigation/ProductShell.tsx");
  assert.match(screen, /if \(id === "plan"\)[\s\S]*onOpen\("plan"\)/);
  assert.match(shell, /overlay === "plan"/);
  assert.match(shell, /<PlanComposerScreen/);
  assert.doesNotMatch(screen, /replanDay|fetch\([^)]*day-plan/);
});

test("M13 preserves conversations, new conversation, and the existing add modal", () => {
  const screen = read("../apps/mobile/src/screens/chat-v4/ChatV4Screen.tsx");
  const history = read("../apps/mobile/src/screens/chat-v4/ChatHistoryDrawer.tsx");
  const chips = read("../apps/mobile/src/screens/chat-v4/ChatQuickChips.tsx");
  assert.match(screen, /loadChat/);
  assert.match(screen, /createChatSession/);
  assert.match(screen, /Modal visible=\{addingTask\}/);
  assert.match(history, /שיחה חדשה/);
  assert.match(chips, /משימה מהירה/);
  assert.match(chips, /בנה לי לו״ז/);
});

test("M13 does not report a domain success before the canonical response", () => {
  const screen = read("../apps/mobile/src/screens/chat-v4/ChatV4Screen.tsx");
  assert.match(screen, /await createTask\(title\);[\s\S]*setAddingTask\(false\)/);
  assert.match(screen, /catch \(err\)[\s\S]*setError/);
});
