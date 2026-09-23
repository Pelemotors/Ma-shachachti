import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

function read(rel: string) {
  return readFileSync(new URL(rel, root), "utf8");
}

test("mobile chat reuses existing session APIs", () => {
  const api = read("apps/mobile/src/api/chat.ts");
  assert.match(api, /\/api\/chat\/sessions/);
  assert.match(api, /\/api\/chat\/session/);
  assert.match(api, /listChatSessions/);
  assert.match(api, /createChatSession/);
  assert.match(api, /session_id=/);
});

test("chat header opens RTL history drawer without deleting memory", () => {
  const header = read("apps/mobile/src/screens/chat-v4/ChatV4Header.tsx");
  const screen = read("apps/mobile/src/screens/chat-v4/ChatV4Screen.tsx");
  const drawer = read("apps/mobile/src/screens/chat-v4/ChatHistoryDrawer.tsx");
  assert.match(header, /accessibilityLabel="שיחות"/);
  assert.match(header, /onHistory/);
  assert.match(screen, /createChatSession/);
  assert.match(screen, /loadChat/);
  assert.match(screen, /ChatHistoryDrawer/);
  assert.match(drawer, /שיחות/);
  assert.match(drawer, /שיחה חדשה/);
  assert.match(drawer, /right: 0/);
  assert.match(drawer, /listChatSessions/);
  assert.match(drawer, /rowSelected/);
  assert.doesNotMatch(drawer, /delete|archive|מחיקה/);
  assert.doesNotMatch(screen, /agent_memory|deleteMemory|wipe/);
});
