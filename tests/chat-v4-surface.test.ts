import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { composeReply } from "../lib/action-schema.ts";

const root = new URL("../", import.meta.url);

function read(rel: string) {
  return readFileSync(new URL(rel, root), "utf8");
}

test("CHAT V4 fixture is disabled for release", () => {
  const fixture = read("apps/mobile/src/screens/chat-v4/chatV4Fixture.ts");
  assert.match(fixture, /CHAT_V4_VISUAL_QA = false/);
  assert.match(fixture, /Never persisted/);
});

test("CHAT V4 screen talks to the real agent APIs", () => {
  const screen = read("apps/mobile/src/screens/chat-v4/ChatV4Screen.tsx");
  assert.match(screen, /loadChat/);
  assert.match(screen, /sendChat/);
  assert.match(screen, /claimSendLock/);
  assert.match(screen, /newChatTurnId/);
  assert.match(screen, /reconcileChatThread/);
  assert.match(screen, /createTask/);
  assert.match(screen, /transcribeRecording/);
  assert.doesNotMatch(screen, /mockAgent|FAKE_REPLY|hardcoded reply/);
  assert.match(screen, /CHAT_V4_VISUAL_QA/);
});

test("CHAT V4 shell mounts the V4 screen on the chat tab", () => {
  const shell = read("apps/mobile/src/navigation/ProductShell.tsx");
  assert.match(shell, /ChatV4Screen/);
  assert.match(shell, /tab === "chat"/);
});

test("CHAT V4 chips map to real product actions", () => {
  const chips = read("apps/mobile/src/screens/chat-v4/ChatQuickChips.tsx");
  const screen = read("apps/mobile/src/screens/chat-v4/ChatV4Screen.tsx");
  assert.match(chips, /הוסף משימה/);
  assert.match(chips, /בנה לי לו״ז/);
  assert.match(chips, /קניות/);
  assert.match(screen, /createTask/);
  assert.match(screen, /onOpen\("plan"\)/);
  assert.match(screen, /onTab\("shopping"\)/);
});

test("CRITICAL: composeReply does not claim success without an executed action", () => {
  const claimed = composeReply("מעולה! הוספתי את המגבונים לרשימה.", []);
  assert.doesNotMatch(claimed, /הוספתי/);
  const failed = composeReply("הוספתי ועדכנתי וסימנתי.", [
    { ok: false, type: "shopping.add", error: "לא הצלחנו להוסיף לרשימת הקניות." },
  ]);
  assert.doesNotMatch(failed, /הוספתי|עדכנתי|סימנתי/);
  const executed = composeReply("מעולה.", [
    { ok: true, type: "shopping.add", title: "מגבונים" },
  ]);
  assert.match(executed, /הוספתי/);
});

test("chat route returns mutation counts for commit-then-speak", () => {
  const route = read("app/api/chat/route.ts");
  assert.match(route, /mutations/);
  assert.match(route, /failed: results.filter/);
  const screen = read("apps/mobile/src/screens/chat-v4/ChatV4Screen.tsx");
  assert.match(screen, /data\.mutations\.failed > 0 && data\.mutations\.ok === 0/);
});

test("CHAT V4 copy and header match the MASTER", () => {
  const header = read("apps/mobile/src/screens/chat-v4/ChatV4Header.tsx");
  const composer = read("apps/mobile/src/screens/chat-v4/ChatV4Composer.tsx");
  const screen = read("apps/mobile/src/screens/chat-v4/ChatV4Screen.tsx");
  assert.match(header, /שיחה/);
  assert.match(header, /כאן אני תמיד בשבילך/);
  assert.match(composer, /כתבו לי כל מה שתרצו/);
  assert.match(screen, /עוד לא התחלנו לשוחח/);
});
