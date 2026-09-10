import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  clearActiveChatSession,
  readActiveChatSession,
  storedSessionNeedsFallback,
  writeActiveChatSession,
} from "../lib/active-chat-session.ts";
import { parseChatRequest } from "../lib/chat-request.ts";
import {
  chatHistoryUrl,
  EMPTY_CHAT_PREVIEW,
  ownChatSession,
  previewChatSession,
  resolveReadableChatSession,
  summarizeChatSessions,
} from "../lib/chat-sessions.ts";
import { formatSessionWhen } from "../lib/time.ts";

const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sessionA = "11111111-1111-4111-8111-111111111111";
const sessionB = "22222222-2222-4222-8222-222222222222";
const sessionC = "33333333-3333-4333-8333-333333333333";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key) {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
    key(index) {
      return [...data.keys()][index] ?? null;
    },
  };
}

function sessionsDb(
  rows: Array<{ id: string; user_id: string; created_at?: string }>,
) {
  const db = {
    from() {
      const filters: Record<string, string> = {};
      const api = {
        select() {
          return api;
        },
        eq(column: string, value: string) {
          filters[column] = value;
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        async maybeSingle() {
          const found = rows.find(
            (row) =>
              row.id === filters.id && row.user_id === filters.user_id,
          );
          return { data: found ?? null, error: null };
        },
      };
      return api;
    },
  };
  return db as never;
}

test("first user message becomes the preview and empty sessions stay unnamed", () => {
  const long =
    "תעזור לי לבנות לו״ז למחר כי אני עם הילדה כל היום ואחר כך יש לי סידורים";
  assert.equal(
    previewChatSession("תעזור לי לבנות לו״ז למחר"),
    "תעזור לי לבנות לו״ז למחר",
  );
  assert.match(previewChatSession(long), /\.\.\.$/);
  assert.ok(previewChatSession(long).length <= 68);
  assert.equal(previewChatSession("   "), EMPTY_CHAT_PREVIEW);
  assert.equal(previewChatSession(null), EMPTY_CHAT_PREVIEW);
});

test("list sessions uses only the supplied user rows and sorts by last_message_at", () => {
  const listed = summarizeChatSessions(
    [
      { id: sessionA, created_at: "2026-09-10T08:00:00.000Z" },
      { id: sessionB, created_at: "2026-09-10T12:00:00.000Z" },
      { id: sessionC, created_at: "2026-09-10T09:00:00.000Z" },
    ],
    [
      {
        session_id: sessionA,
        role: "user",
        content: "בשיחה הזו נדבר על סידור הבית.",
        created_at: "2026-09-10T08:10:00.000Z",
      },
      {
        session_id: sessionB,
        role: "user",
        content: "בשיחה הזו נדבר על קניות.",
        created_at: "2026-09-10T12:10:00.000Z",
      },
      {
        session_id: sessionA,
        role: "assistant",
        content: "בשמחה.",
        created_at: "2026-09-10T18:00:00.000Z",
      },
      {
        session_id: "99999999-9999-4999-8999-999999999999",
        role: "user",
        content: "שיחה של מישהו אחר",
        created_at: "2026-09-10T20:00:00.000Z",
      },
    ],
  );

  assert.deepEqual(
    listed.sessions.map((session) => session.id),
    [sessionA, sessionB, sessionC],
  );
  assert.equal(listed.sessions[0]?.preview, "בשיחה הזו נדבר על סידור הבית.");
  assert.equal(listed.sessions[1]?.preview, "בשיחה הזו נדבר על קניות.");
  assert.equal(listed.sessions[2]?.preview, EMPTY_CHAT_PREVIEW);
  assert.equal(listed.sessions[0]?.message_count, 2);
  assert.equal(listed.sessions[0]?.last_message_at, "2026-09-10T18:00:00.000Z");
  assert.equal(listed.sessions[2]?.last_message_at, "2026-09-10T09:00:00.000Z");
  assert.equal(
    listed.sessions.some((session) => session.preview.includes("מישהו אחר")),
    false,
  );
});

test("opening a session asks only for that session id", () => {
  assert.equal(chatHistoryUrl(sessionA), `/api/chat?session_id=${sessionA}`);
  assert.equal(chatHistoryUrl("not-a-uuid"), "/api/chat");
  assert.equal(chatHistoryUrl(null), "/api/chat");
});

test("user A cannot open or continue user B session", async () => {
  const db = sessionsDb([{ id: sessionB, user_id: userB }]);
  assert.equal(await ownChatSession(db, userA, sessionB), false);
  const opened = await resolveReadableChatSession(db, userA, sessionB);
  assert.deepEqual(opened, { ok: false, status: 403 });
  const badId = await resolveReadableChatSession(db, userA, "not-a-uuid");
  assert.deepEqual(badId, { ok: false, status: 400 });
});

test("user A can continue only an owned session", async () => {
  const db = sessionsDb([{ id: sessionA, user_id: userA }]);
  const opened = await resolveReadableChatSession(db, userA, sessionA);
  assert.deepEqual(opened, { ok: true, session: { id: sessionA } });
  const parsed = parseChatRequest({
    message: "בוא נמשיך מאיפה שהפסקנו.",
    session_id: sessionA,
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.request.session_id, sessionA);
});

test("active session persistence is scoped by user and falls back safely", () => {
  const store = memoryStorage();
  writeActiveChatSession(userA, sessionA, store);
  writeActiveChatSession(userB, sessionB, store);
  assert.equal(readActiveChatSession(userA, store), sessionA);
  assert.equal(readActiveChatSession(userB, store), sessionB);
  store.setItem(`ma-shachachti-active-chat:${userA}`, "not-a-uuid");
  assert.equal(readActiveChatSession(userA, store), null);
  assert.equal(storedSessionNeedsFallback(403), true);
  assert.equal(storedSessionNeedsFallback(400), true);
  assert.equal(storedSessionNeedsFallback(200), false);
  clearActiveChatSession(userB, store);
  assert.equal(readActiveChatSession(userB, store), null);
});

test("session stamp uses Jerusalem today/yesterday labels", () => {
  const now = new Date("2026-09-10T17:50:00.000Z");
  assert.match(formatSessionWhen("2026-09-10T17:40:00.000Z", now), /היום · 20:40/);
  assert.match(formatSessionWhen("2026-09-09T15:10:00.000Z", now), /אתמול · 18:10/);
});

test("chat route keeps current tasks and global memory, and isolates session history", () => {
  const route = readFileSync(new URL("../app/api/chat/route.ts", import.meta.url), "utf8");
  assert.match(route, /resolveReadableChatSession/);
  assert.match(route, /loadSessionMessages/);
  assert.match(route, /loadTasks/);
  assert.match(route, /loadMemory/);
  assert.match(route, /ownChatSession/);
  assert.doesNotMatch(route, /agent_memory[\s\S]*session_id/);
  const createRoute = readFileSync(
    new URL("../app/api/chat/session/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(createRoute, /createChatSession/);
  const app = readFileSync(new URL("../components/chat-app.tsx", import.meta.url), "utf8");
  assert.match(app, /writeActiveChatSession/);
  assert.match(app, /openPreviousSession/);
  assert.match(app, /startNewChat/);
  assert.match(app, /session_id: sessionId/);
});
