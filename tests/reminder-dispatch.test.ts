import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deliverToSubscriptions,
  deliverUserPush,
  dispatchDueReminders,
} from "../lib/reminder-dispatch.ts";
import { readFileSync } from "node:fs";
import type { ReminderTask } from "../lib/reminder-plan.ts";

type Sub = {
  endpoint: string;
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  user_id: string;
};

function task(partial: Partial<ReminderTask> = {}): ReminderTask {
  return {
    id: "task-1",
    user_id: "user-a",
    title: "להזמין אוכל לדגים",
    status: "open",
    reminder_at: null,
    due_at: "2026-09-10T18:00:00.000Z",
    planned_start_at: null,
    reminder_enabled: true,
    reminder_offset_minutes: null,
    reminder_sent_at: null,
    reminder_claimed_at: null,
    ...partial,
  };
}

function createDb(state: {
  tasks: ReminderTask[];
  prefs: { user_id: string; default_reminder_minutes: number }[];
  subs: Sub[];
}) {
  const db = {
    state,
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let pending: Record<string, unknown> | null = null;
      let deleting = false;

      function matches(row: Record<string, unknown>) {
        return Object.entries(filters).every(([key, value]) => {
          if (key.startsWith("is:")) return row[key.slice(3)] == null;
          if (key.startsWith("not:")) return row[key.slice(4)] != null;
          return row[key] === value;
        });
      }

      function rows(): Record<string, unknown>[] {
        if (table === "tasks") return state.tasks as unknown as Record<string, unknown>[];
        if (table === "notification_preferences") {
          return state.prefs as unknown as Record<string, unknown>[];
        }
        return state.subs as unknown as Record<string, unknown>[];
      }

      function collect() {
        return rows().filter((row) => matches(row));
      }

      function apply() {
        if (table === "user_push_subscriptions" && deleting) {
          state.subs = state.subs.filter((row) => !matches(row as never));
          return state.subs;
        }
        if (pending && table === "tasks") {
          const matched = state.tasks.filter((row) => matches(row as never));
          for (const row of matched) Object.assign(row, pending);
          return matched;
        }
        return collect();
      }

      const api: Record<string, unknown> = {
        select() {
          return api;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return api;
        },
        not(column: string, _op: string, value: unknown) {
          filters[`not:${column}`] = value;
          return api;
        },
        is(column: string, value: unknown) {
          filters[`is:${column}`] = value;
          return api;
        },
        or() {
          return api;
        },
        limit() {
          return api;
        },
        update(next: Record<string, unknown>) {
          pending = next;
          return api;
        },
        delete() {
          deleting = true;
          return api;
        },
        maybeSingle() {
          const applied = apply();
          return Promise.resolve({
            data: Array.isArray(applied) ? (applied[0] ?? null) : applied,
            error: null,
          });
        },
        then(
          resolve: (value: { data: unknown; error: null }) => unknown,
          reject: (reason: unknown) => unknown,
        ) {
          return Promise.resolve({
            data: pending || deleting ? apply() : collect(),
            error: null,
          }).then(resolve, reject);
        },
      };
      return api;
    },
  };
  return db;
}

const now = new Date("2026-09-10T17:31:00.000Z");

test("duplicate cron does not duplicate Push", async () => {
  const db = createDb({
    tasks: [task()],
    prefs: [{ user_id: "user-a", default_reminder_minutes: 30 }],
    subs: [
      {
        user_id: "user-a",
        endpoint: "https://fcm.googleapis.com/fcm/send/a",
        subscription: {
          endpoint: "https://fcm.googleapis.com/fcm/send/a",
          keys: { p256dh: "x", auth: "y" },
        },
      },
    ],
  });
  const sent: string[] = [];
  const first = await dispatchDueReminders(db as never, {
    now,
    requireVapid: false,
    send: async () => {
      sent.push("one");
    },
  });
  const second = await dispatchDueReminders(db as never, {
    now,
    requireVapid: false,
    send: async () => {
      sent.push("two");
    },
  });
  assert.equal(first.sent, 1);
  assert.equal(second.sent, 0);
  assert.deepEqual(sent, ["one"]);
  assert.ok(db.state.tasks[0]?.reminder_sent_at);
});

test("one failed device does not block another device", async () => {
  const gone: string[] = [];
  const delivered: string[] = [];
  const result = await deliverToSubscriptions(
    [
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/dead",
        subscription: {
          endpoint: "https://fcm.googleapis.com/fcm/send/dead",
          keys: { p256dh: "x", auth: "y" },
        },
      },
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/live",
        subscription: {
          endpoint: "https://fcm.googleapis.com/fcm/send/live",
          keys: { p256dh: "x", auth: "y" },
        },
      },
    ],
    "{}",
    async (subscription) => {
      if (subscription.endpoint.includes("dead")) {
        const error = new Error("gone") as Error & { statusCode: number };
        error.statusCode = 410;
        throw error;
      }
      delivered.push(subscription.endpoint);
    },
    async (endpoint) => {
      gone.push(endpoint);
    },
  );
  assert.equal(result.delivered, 1);
  assert.deepEqual(gone, ["https://fcm.googleapis.com/fcm/send/dead"]);
  assert.deepEqual(delivered, ["https://fcm.googleapis.com/fcm/send/live"]);
});

test("shared user delivery loads only that user's subscriptions and cleans gone rows", async () => {
  const db = createDb({
    tasks: [],
    prefs: [],
    subs: [
      {
        user_id: "user-a",
        endpoint: "https://fcm.googleapis.com/fcm/send/dead",
        subscription: {
          endpoint: "https://fcm.googleapis.com/fcm/send/dead",
          keys: { p256dh: "x", auth: "y" },
        },
      },
      {
        user_id: "user-b",
        endpoint: "https://fcm.googleapis.com/fcm/send/other",
        subscription: {
          endpoint: "https://fcm.googleapis.com/fcm/send/other",
          keys: { p256dh: "x", auth: "y" },
        },
      },
    ],
  });
  const result = await deliverUserPush(db as never, "user-a", "{}", async () => {
    const error = new Error("gone") as Error & { statusCode: number };
    error.statusCode = 410;
    throw error;
  });
  assert.equal(result.gone, 1);
  assert.deepEqual(
    db.state.subs.map((row) => row.user_id),
    ["user-b"],
  );
});

test("test push route is authenticated, uses shared delivery, and records diagnostics", () => {
  const source = readFileSync(
    new URL("../app/api/push/test/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /await authorize\(req\)/);
  assert.match(source, /deliverUserPush/);
  assert.match(source, /eventType: "push\.test"/);
  assert.match(source, /outcome: "no_subscription"/);
});

test("expired 404 subscription is removed and the other device still receives Push", async () => {
  const db = createDb({
    tasks: [task()],
    prefs: [{ user_id: "user-a", default_reminder_minutes: 30 }],
    subs: [
      {
        user_id: "user-a",
        endpoint: "https://fcm.googleapis.com/fcm/send/old",
        subscription: {
          endpoint: "https://fcm.googleapis.com/fcm/send/old",
          keys: { p256dh: "x", auth: "y" },
        },
      },
      {
        user_id: "user-a",
        endpoint: "https://fcm.googleapis.com/fcm/send/ok",
        subscription: {
          endpoint: "https://fcm.googleapis.com/fcm/send/ok",
          keys: { p256dh: "x", auth: "y" },
        },
      },
    ],
  });
  const result = await dispatchDueReminders(db as never, {
    now,
    requireVapid: false,
    send: async (subscription) => {
      if (subscription.endpoint.includes("old")) {
        const error = new Error("gone") as Error & { statusCode: number };
        error.statusCode = 404;
        throw error;
      }
    },
  });
  assert.equal(result.sent, 1);
  assert.deepEqual(
    db.state.subs.map((row) => row.endpoint),
    ["https://fcm.googleapis.com/fcm/send/ok"],
  );
});

test("no subscription releases the claim and never records a sent reminder", async () => {
  const db = createDb({
    tasks: [task()],
    prefs: [{ user_id: "user-a", default_reminder_minutes: 30 }],
    subs: [],
  });
  const result = await dispatchDueReminders(db as never, {
    now,
    requireVapid: false,
    send: async () => undefined,
  });
  assert.equal(result.sent, 0);
  assert.equal(result.noSubscription, 1);
  assert.equal(db.state.tasks[0]?.reminder_sent_at, null);
  assert.equal(db.state.tasks[0]?.reminder_claimed_at, null);
});

test("transient delivery failure releases the claim for a later retry", async () => {
  const db = createDb({
    tasks: [task()],
    prefs: [{ user_id: "user-a", default_reminder_minutes: 30 }],
    subs: [
      {
        user_id: "user-a",
        endpoint: "https://fcm.googleapis.com/fcm/send/retry",
        subscription: {
          endpoint: "https://fcm.googleapis.com/fcm/send/retry",
          keys: { p256dh: "x", auth: "y" },
        },
      },
    ],
  });
  const result = await dispatchDueReminders(db as never, {
    now,
    requireVapid: false,
    send: async () => {
      throw Object.assign(new Error("temporary"), { statusCode: 503 });
    },
  });
  assert.equal(result.failed, 1);
  assert.equal(result.sent, 0);
  assert.equal(db.state.tasks[0]?.reminder_sent_at, null);
  assert.equal(db.state.tasks[0]?.reminder_claimed_at, null);
});

test("expired reminders resolve without pretending they were sent", async () => {
  const db = createDb({
    tasks: [task()],
    prefs: [{ user_id: "user-a", default_reminder_minutes: 30 }],
    subs: [],
  });
  const result = await dispatchDueReminders(db as never, {
    now: new Date("2026-09-10T20:00:00.000Z"),
    requireVapid: false,
    send: async () => undefined,
  });
  assert.equal(result.expired, 1);
  assert.equal(result.sent, 0);
  assert.equal(db.state.tasks[0]?.reminder_sent_at, null);
  assert.equal(db.state.tasks[0]?.reminder_claimed_at, null);
});
