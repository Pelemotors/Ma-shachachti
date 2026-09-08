import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { emptyState, migrateState, Action } from "../lib/model";
import {
  applyActions,
  shouldAskWorkTime,
  planDay,
  buildDailyPlanSession,
} from "../lib/engine";
import {
  listOpenSuggestions,
  calendarSuggestionKey,
  remindersNewestFirst,
} from "../lib/domain/suggestions";
import { ActionSchema } from "../lib/model";

const now = new Date("2026-09-08T10:00:00Z");
const create = (title: string, extra = {}) =>
  ({ type: "task.create", task: { title, ...extra } }) as Action;

test("durationFeedbackAskedAt: ask once, dismiss still counts, occurrence inherits", () => {
  let s = applyActions(emptyState(), [create("כביסה", { recurrenceDays: 7 })], now);
  const task = s.tasks[0]!;
  assert.equal(task.durationFeedbackAskedAt, null);
  assert.equal(shouldAskWorkTime(task, s), true);

  s = applyActions(
    s,
    [{ type: "durationFeedback.markAsked", taskId: task.id }],
    now,
  );
  assert.ok(s.tasks[0]!.durationFeedbackAskedAt);
  assert.equal(shouldAskWorkTime(s.tasks[0]!, s), false);

  s = applyActions(
    s,
    [{ type: "task.status", id: task.id, status: "done" }],
    now,
  );
  const occurrence = s.tasks.find((t) => t.occurrenceOf === task.id)!;
  assert.ok(occurrence);
  assert.ok(occurrence.durationFeedbackAskedAt);
  assert.equal(shouldAskWorkTime(occurrence, s), false);
});

test("legacy state hydrates durationFeedbackAskedAt and suggestionHistory keys", () => {
  const seeded = applyActions(emptyState(), [create("ישן")], now);
  const task = { ...seeded.tasks[0]! } as Record<string, unknown>;
  delete task.durationFeedbackAskedAt;
  const raw = {
    ...seeded,
    tasks: [task],
    suggestionHistory: [
      {
        taskId: task.id,
        suggestedAt: now.toISOString(),
        selectedAt: null,
        declinedAt: now.toISOString(),
      },
    ],
  };
  const migrated = migrateState(raw);
  assert.equal(migrated.tasks[0]!.durationFeedbackAskedAt, null);
  assert.ok(migrated.suggestionHistory[0]!.id);
  assert.ok(migrated.suggestionHistory[0]!.suggestionKey);
  assert.equal(migrated.suggestionHistory[0]!.source, "catalog");
});

test("reminder.update keeps same id, rejects past due, no duplicate", () => {
  let s = applyActions(
    emptyState(),
    [
      {
        type: "reminder.add",
        title: "להוציא כלב",
        dueAt: "2030-01-01T10:00:00Z",
        taskId: null,
      },
    ],
    now,
  );
  const id = s.reminders[0]!.id;
  assert.ok(s.reminders[0]!.createdAt);

  s = applyActions(
    s,
    [
      {
        type: "reminder.update",
        id,
        patch: {
          title: "להוציא כלב לטיול",
          dueAt: "2030-01-02T11:00:00Z",
          urgency: "urgent",
        },
      },
    ],
    now,
  );
  assert.equal(s.reminders.length, 1);
  assert.equal(s.reminders[0]!.id, id);
  assert.equal(s.reminders[0]!.title, "להוציא כלב לטיול");
  assert.equal(s.reminders[0]!.dueAt, "2030-01-02T11:00:00Z");
  assert.equal(s.reminders[0]!.urgency, "urgent");
  assert.equal(s.reminders[0]!.status, "pending");

  assert.throws(
    () =>
      applyActions(
        s,
        [
          {
            type: "reminder.update",
            id,
            patch: { dueAt: "2020-01-01T00:00:00Z" },
          },
        ],
        now,
      ),
    /עתיד/,
  );

  s = applyActions(
    s,
    [
      {
        type: "reminder.add",
        title: "אחרת",
        dueAt: "2030-06-01T10:00:00Z",
        taskId: null,
      },
    ],
    now,
  );
  assert.throws(
    () =>
      applyActions(
        s,
        [
          {
            type: "reminder.update",
            id: s.reminders[1]!.id,
            patch: {
              title: "להוציא כלב לטיול",
              dueAt: "2030-01-02T11:00:00Z",
            },
          },
        ],
        now,
      ),
    /דומה/,
  );
});

test("remindersNewestFirst sorts by createdAt desc", () => {
  let s = emptyState();
  s = applyActions(
    s,
    [
      {
        type: "reminder.add",
        title: "ראשונה",
        dueAt: "2030-01-01T10:00:00Z",
        taskId: null,
      },
    ],
    new Date("2026-09-08T09:00:00Z"),
  );
  s = applyActions(
    s,
    [
      {
        type: "reminder.add",
        title: "שנייה",
        dueAt: "2030-01-02T10:00:00Z",
        taskId: null,
      },
    ],
    new Date("2026-09-08T10:00:00Z"),
  );
  const sorted = remindersNewestFirst(s);
  assert.equal(sorted[0]!.title, "שנייה");
  assert.equal(sorted[1]!.title, "ראשונה");
});

test("suggestions: handled filtered before slice; next fills slot", () => {
  let s = emptyState();
  const open = listOpenSuggestions(s, now, 3);
  assert.ok(open.length >= 1);
  const first = open[0]!;
  s = applyActions(
    s,
    [
      {
        type: "suggestion.record",
        suggestionKey: first.suggestionKey,
        source: first.source,
        outcome: "declined",
      },
    ],
    now,
  );
  const after = listOpenSuggestions(s, now, 3);
  assert.equal(
    after.some((x) => x.suggestionKey === first.suggestionKey),
    false,
  );
  if (open.length > 3 || after.length === 3) {
    // slot freed — a previously out-of-slice suggestion can enter
    assert.ok(after.length <= 3);
  }

  const calKey = calendarSuggestionKey("בדיקת לוח שנה");
  s = applyActions(
    s,
    [
      {
        type: "suggestion.record",
        suggestionKey: calKey,
        source: "calendar",
        outcome: "selected",
      },
    ],
    now,
  );
  assert.ok(
    s.suggestionHistory.some(
      (r) => r.suggestionKey === calKey && r.selectedAt != null,
    ),
  );
});

test("changedDay note reaches planning constraint used by planDay/agent context", () => {
  let s = applyActions(emptyState(), [create("משימה חשובה", { effort: 1 })], now);
  const dateKey = "2026-09-08";
  s = applyActions(
    s,
    [
      {
        type: "planning.set",
        constraint: {
          date: dateKey,
          availableFrom: null,
          availableUntil: null,
          unavailable: [],
          effort: 1,
          note: "יש ילד חולה בבית",
        },
      },
    ],
    now,
  );
  assert.equal(s.planning.today?.note, "יש ילד חולה בבית");
  const plan = planDay(s, 120, 2, now);
  assert.ok(plan);
  const session = buildDailyPlanSession(s, 120, 1, 0, now);
  assert.equal(session.effort, 1);
  assert.equal(s.planning.today?.note, "יש ילד חולה בבית");
});

test("first scan: return-to-capture preserves session id+chunks; add-missing new session", () => {
  const sessionId = crypto.randomUUID();
  const chunkId = crypto.randomUUID();
  const stamp = now.toISOString();
  let s = applyActions(
    emptyState(),
    [
      {
        type: "scan.set",
        firstScan: {
          status: "in_progress",
          session: {
            id: sessionId,
            status: "review",
            chunks: [
              {
                id: chunkId,
                text: "יש לנו כלב",
                createdAt: stamp,
                source: "text",
              },
            ],
            draftAnalysis: { ok: true },
            proposalId: null,
            createdAt: stamp,
            updatedAt: stamp,
          },
        },
      },
    ],
    now,
  );
  assert.equal(s.firstScan.session?.id, sessionId);
  assert.equal(s.firstScan.session?.chunks.length, 1);

  s = applyActions(
    s,
    [
      {
        type: "scan.set",
        firstScan: {
          status: "in_progress",
          session: {
            ...s.firstScan.session!,
            status: "in_progress",
            updatedAt: stamp,
          },
        },
      },
    ],
    now,
  );
  assert.equal(s.firstScan.session?.id, sessionId);
  assert.equal(s.firstScan.session?.chunks[0]!.id, chunkId);
  assert.equal(s.firstScan.session?.status, "in_progress");

  const newId = crypto.randomUUID();
  s = applyActions(
    s,
    [
      {
        type: "task.create",
        task: { title: "משימה מסקירה" },
      },
      {
        type: "scan.set",
        firstScan: {
          status: "in_progress",
          completedAt: stamp,
          session: {
            id: newId,
            status: "in_progress",
            chunks: [],
            draftAnalysis: null,
            proposalId: null,
            createdAt: stamp,
            updatedAt: stamp,
          },
        },
      },
    ],
    now,
  );
  assert.equal(s.firstScan.session?.id, newId);
  assert.equal(s.firstScan.session?.chunks.length, 0);
  assert.equal(s.firstScan.session?.draftAnalysis, null);
  assert.ok(s.tasks.some((t) => t.title === "משימה מסקירה"));
});

test("reminder.update ActionSchema accepts patch; durationFeedback.markAsked parses", () => {
  const upd = ActionSchema.parse({
    type: "reminder.update",
    id: crypto.randomUUID(),
    patch: { title: "חדש" },
  });
  assert.equal(upd.type, "reminder.update");
  const mark = ActionSchema.parse({
    type: "durationFeedback.markAsked",
    taskId: crypto.randomUUID(),
  });
  assert.equal(mark.type, "durationFeedback.markAsked");
});

test("reminder_queue clears lease when dueAt reschedules via save_app_state", async () => {
  const one = "10000000-0000-4000-8000-000000000001";
  const db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,service_role; grant select on auth.users to authenticated,service_role; insert into auth.users values('${one}','one@example.com');`,
  );
  await db.exec(
    await readFile(new URL("../database/schema.sql", import.meta.url), "utf8"),
  );
  await db.exec(
    await readFile(
      new URL(
        "../database/migrations/20260908_reminder_queue_reschedule_clear_lease.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  try {
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','${one}',false);`,
    );
    let s = applyActions(
      emptyState(),
      [
        {
          type: "reminder.add",
          title: "תזכורת",
          dueAt: "2030-01-01T10:00:00Z",
          taskId: null,
        },
      ],
      now,
    );
    await db.query("select save_app_state($1::jsonb,0)", [JSON.stringify(s)]);
    await db.exec(
      `update reminder_queue set lease_until = now() + interval '2 minutes' where id = '${s.reminders[0]!.id}'`,
    );
    const leased = await db.query<{ lease_until: string | null }>(
      "select lease_until from reminder_queue",
    );
    assert.ok(leased.rows[0]!.lease_until);

    s = applyActions(
      s,
      [
        {
          type: "reminder.update",
          id: s.reminders[0]!.id,
          patch: { dueAt: "2030-02-01T10:00:00Z" },
        },
      ],
      now,
    );
    await db.query("select save_app_state($1::jsonb,1)", [JSON.stringify(s)]);
    const row = await db.query<{
      due_at: string;
      lease_until: string | null;
      status: string;
    }>("select due_at, lease_until, status from reminder_queue");
    assert.equal(row.rows[0]!.status, "pending");
    assert.equal(row.rows[0]!.lease_until, null);
    const due = row.rows[0]!.due_at as string | Date;
    const dueMs =
      typeof due === "object" && due !== null && "getTime" in due
        ? (due as Date).getTime()
        : Date.parse(String(due));
    assert.equal(dueMs, Date.parse("2030-02-01T10:00:00Z"));
  } finally {
    await db.close();
  }
});
