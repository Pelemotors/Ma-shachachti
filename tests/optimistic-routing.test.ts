import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { decodeAppRoute, encodeAppRoute } from "../lib/app-route-state.ts";
import { chatTurnRequest, createPendingChatTurn } from "../lib/chat-optimistic.ts";
import { readChatDraft, writeChatDraft } from "../lib/chat-draft.ts";
import { OptimisticMutationLayer } from "../lib/optimistic-mutation.ts";

const session = "11111111-1111-4111-8111-111111111111";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear() { data.clear(); },
    getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
    key(index) { return [...data.keys()][index] ?? null; },
  };
}

test("optimistic mutation reconciles canonical state and dedupes in flight", async () => {
  const layer = new OptimisticMutationLayer();
  let state = ["old"];
  let releases!: (value: string[]) => void;
  let calls = 0;
  const commit = () => {
    calls += 1;
    return new Promise<string[]>((resolve) => { releases = resolve; });
  };
  const mutation = {
    key: "task:1",
    current: () => state,
    optimistic: () => ["optimistic"],
    commit,
    publish: (value: string[]) => { state = value; },
    errorMessage: "failed",
  };
  const first = layer.run(mutation, () => undefined);
  const duplicate = layer.run(mutation, () => undefined);
  assert.deepEqual(state, ["optimistic"]);
  assert.equal(calls, 1);
  releases(["canonical"]);
  assert.equal(await first, true);
  assert.equal(await duplicate, true);
  assert.deepEqual(state, ["canonical"]);
});

test("failure rolls back and retry succeeds", async () => {
  const layer = new OptimisticMutationLayer();
  let state = "before";
  let attempt = 0;
  let retry: (() => Promise<boolean>) | undefined;
  await layer.run({
    key: "schedule:1",
    current: () => state,
    optimistic: () => "saving",
    commit: async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("offline");
      return "saved";
    },
    publish: (value) => { state = value; },
    errorMessage: "failed",
  }, (failure) => { retry = failure?.retry; });
  assert.equal(state, "before");
  assert.ok(retry);
  assert.equal(await retry!(), true);
  assert.equal(state, "saved");
});

test("undo is a real reverse mutation and reports canonical reverse result", async () => {
  const layer = new OptimisticMutationLayer();
  let state = "open";
  let undo: (() => Promise<boolean>) | undefined;
  await layer.run({
    key: "task:1",
    current: () => state,
    optimistic: () => "done",
    commit: async () => "server-done",
    reverse: async () => "server-open",
    publish: (value) => { state = value; },
    errorMessage: "failed",
  }, () => undefined, (opportunity) => { undo = opportunity?.undo; });
  assert.equal(state, "server-done");
  assert.ok(undo);
  assert.equal(await undo!(), true);
  assert.equal(state, "server-open");
});

test("chat retry preserves turn id and surface", () => {
  const turn = createPendingChatTurn("שלום", "schedule", "turn-stable");
  assert.deepEqual(chatTurnRequest(turn, session), {
    message: "שלום",
    surface: "schedule",
    session_id: session,
    turn_id: "turn-stable",
  });
  assert.equal(chatTurnRequest(turn, session).turn_id, turn.turnId);
});

test("URL state round trips view, date and session with invalid fallback", () => {
  assert.deepEqual(decodeAppRoute(encodeAppRoute({
    view: "schedule",
    date: "2026-09-12",
    sessionId: null,
  }).split("?")[1] ?? ""), {
    view: "schedule",
    date: "2026-09-12",
    sessionId: null,
  });
  assert.deepEqual(decodeAppRoute(`view=chat&session=${session}`), {
    view: "chat",
    date: null,
    sessionId: session,
  });
  assert.deepEqual(decodeAppRoute("view=admin&session=bad&date=2026-02-30"), {
    view: "home",
    date: null,
    sessionId: null,
  });
});

test("successive URL snapshots restore back/forward date and session state", () => {
  const history = [
    "view=schedule&date=2026-09-12",
    `view=chat&session=${session}`,
  ];
  assert.equal(decodeAppRoute(history[0]!).date, "2026-09-12");
  assert.equal(decodeAppRoute(history[1]!).sessionId, session);
  assert.equal(decodeAppRoute(history[0]!).view, "schedule");
  const app = readFileSync(
    new URL("../components/chat-app.tsx", import.meta.url),
    "utf8",
  );
  assert.match(app, /useSearchParams/);
  assert.match(app, /openPreviousSession\(route\.sessionId, false\)/);
});

test("drafts are isolated by user and session and clear only explicitly", () => {
  const store = memoryStorage();
  writeChatDraft("user-a", session, "א", store);
  writeChatDraft("user-b", session, "ב", store);
  writeChatDraft("user-a", null, "חדש", store);
  assert.equal(readChatDraft("user-a", session, store), "א");
  assert.equal(readChatDraft("user-b", session, store), "ב");
  assert.equal(readChatDraft("user-a", null, store), "חדש");
  writeChatDraft("user-a", session, "", store);
  assert.equal(readChatDraft("user-a", session, store), "");
  assert.equal(readChatDraft("user-b", session, store), "ב");
});
