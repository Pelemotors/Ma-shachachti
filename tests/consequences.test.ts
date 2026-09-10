import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDecision } from "../lib/action-schema.ts";
import { executeAction } from "../lib/actions.ts";
import {
  applySurfaceTurnPolicy,
  buildInstructions,
} from "../lib/agent/turn.ts";
import {
  parseConsequenceUpdate,
  persistConsequenceUpdates,
} from "../lib/consequences.ts";
import { resolveAgentPresentation } from "../lib/presentation.ts";
import type { AgentAction, ConsequenceRow, TaskRow } from "../lib/types.ts";

const ownId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const thirdId = "33333333-3333-4333-8333-333333333333";

function task(partial: Partial<TaskRow> & Pick<TaskRow, "id" | "title">): TaskRow {
  return {
    notes: "",
    status: "open",
    due_on: null,
    due_at: null,
    reminder_offset_minutes: null,
    reminder_enabled: true,
    reminder_sent_at: null,
    reminder_claimed_at: null,
    planned_start_at: null,
    planned_end_at: null,
    reschedule_count: 0,
    last_rescheduled_at: null,
    created_at: "2026-09-10T00:00:00.000Z",
    updated_at: "2026-09-10T00:00:00.000Z",
    completed_at: null,
    ...partial,
  };
}

function validUpdate(taskId = ownId) {
  return {
    task_id: taskId,
    severity: "medium",
    reason: "המשך דחייה עלול להביא למחסור באוכל",
    confidence: "medium",
    basis: { kind: "inferred" as const },
    valid_until: null,
  };
}

function action(partial: Partial<AgentAction>): AgentAction {
  return {
    type: "task.reschedule",
    id: ownId,
    title: "להזמין אוכל לכלב",
    notes: null,
    due_on: "2026-09-12",
    due_time: null,
    due_patch: "set",
    reminder_enabled: null,
    reminder_offset_minutes: null,
    reminder_patch: null,
    plan_patch: null,
    planned_date: null,
    planned_start_time: null,
    planned_end_time: null,
    kind: null,
    content: null,
    confidence: null,
    silent: null,
    ...partial,
  };
}

type TaskRec = {
  id: string;
  user_id: string;
  title: string;
  due_on: string | null;
  due_at: string | null;
  reminder_enabled: boolean;
  reminder_offset_minutes: number | null;
  reminder_sent_at: string | null;
  reminder_claimed_at: string | null;
  planned_start_at: string | null;
  planned_end_at: string | null;
  reschedule_count: number;
  last_rescheduled_at: string | null;
};

function tasksDb(rows: TaskRec[]) {
  const db = {
    from() {
      let filters: Record<string, string> = {};
      let payload: Record<string, unknown> = {};
      let op: "select" | "update" = "select";
      const api = {
        select() {
          return api;
        },
        eq(column: string, value: string) {
          filters[column] = value;
          return api;
        },
        update(next: Record<string, unknown>) {
          op = "update";
          payload = next;
          return api;
        },
        async maybeSingle() {
          const found = rows.find(
            (row) => row.id === filters.id && row.user_id === filters.user_id,
          );
          return { data: found ?? null, error: null };
        },
        then(
          resolve: (value: { data: unknown; error: null }) => unknown,
          reject?: (reason: unknown) => unknown,
        ) {
          if (op === "update") {
            const found = rows.find(
              (row) => row.id === filters.id && row.user_id === filters.user_id,
            );
            if (found) Object.assign(found, payload);
            return Promise.resolve({ data: found ?? null, error: null }).then(
              resolve,
              reject,
            );
          }
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return api;
    },
  };
  return db as never;
}

function persistDb(input: {
  ownerTaskIds: string[];
  failIds?: string[];
  existing?: Map<string, Record<string, unknown>>;
}) {
  const stored = input.existing ?? new Map<string, Record<string, unknown>>();
  const upserts: Record<string, unknown>[] = [];
  const db = {
    from(table: string) {
      let id = "";
      const api = {
        select() {
          return api;
        },
        eq(_column: string, value: string) {
          if (_column === "id" || _column === "task_id") id = value;
          return api;
        },
        async maybeSingle() {
          return {
            data: input.ownerTaskIds.includes(id) ? { id } : null,
            error: null,
          };
        },
        upsert(row: Record<string, unknown>) {
          const taskId = String(row.task_id);
          if (input.failIds?.includes(taskId)) {
            return Promise.reject(new Error("upsert_failed"));
          }
          upserts.push(row);
          stored.set(taskId, row);
          return Promise.resolve({ error: null });
        },
      };
      if (table !== "tasks" && table !== "task_consequences") {
        return api;
      }
      return api;
    },
  };
  return { db: db as never, stored, upserts };
}

test("schema accepts an empty consequence_updates array", () => {
  const parsed = parseDecision(
    JSON.stringify({
      reply: "אין משהו דחוף עכשיו.",
      actions: [],
      presentation: null,
      consequence_updates: [],
    }),
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.consequence_updates, []);
});

test("missing consequence_updates does not fail the turn", () => {
  const parsed = parseDecision(
    JSON.stringify({
      reply: "שמרתי הקשר.",
      actions: [],
      presentation: null,
    }),
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.consequence_updates, []);
});

test("a valid consequence update passes local validation", () => {
  assert.deepEqual(parseConsequenceUpdate(validUpdate()), validUpdate());
});

test("an invalid consequence update is rejected locally", () => {
  assert.equal(parseConsequenceUpdate({ ...validUpdate(), severity: "urgent" }), null);
  assert.equal(parseConsequenceUpdate({ ...validUpdate(), task_id: "not-a-uuid" }), null);
  assert.equal(parseConsequenceUpdate({ ...validUpdate(), reason: "" }), null);
  assert.equal(
    parseConsequenceUpdate({ ...validUpdate(), valid_until: "tomorrow" }),
    null,
  );
  assert.equal(
    parseConsequenceUpdate({ ...validUpdate(), basis: { kind: "guess" } }),
    null,
  );
});

test("invalid consequence updates do not fail parseDecision", () => {
  const parsed = parseDecision(
    JSON.stringify({
      reply: "הנה מה שחשוב.",
      actions: [],
      presentation: { type: "task_list", task_ids: [ownId] },
      consequence_updates: [{ task_id: "bad", severity: "nope" }],
    }),
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.presentation?.type, "task_list");
    assert.equal(parsed.consequence_updates.length, 1);
  }
});

test("a valid consequence is upserted and does not create a second row", async () => {
  const { db, stored, upserts } = persistDb({ ownerTaskIds: [ownId] });
  await persistConsequenceUpdates(db, "user-1", [validUpdate()]);
  await persistConsequenceUpdates(db, "user-1", [
    { ...validUpdate(), reason: "מצאתי עוד שק מלא", severity: "low" },
  ]);
  assert.equal(upserts.length, 2);
  assert.equal(stored.size, 1);
  assert.equal(stored.get(ownId)?.reason, "מצאתי עוד שק מלא");
});

test("a consequence for another user's task is not saved", async () => {
  const { db, stored } = persistDb({ ownerTaskIds: [ownId] });
  await persistConsequenceUpdates(db, "user-1", [validUpdate(otherId)]);
  assert.equal(stored.size, 0);
});

test("one failed consequence does not block another valid update", async () => {
  const { db, stored } = persistDb({
    ownerTaskIds: [ownId, thirdId],
    failIds: [ownId],
  });
  await persistConsequenceUpdates(db, "user-1", [
    validUpdate(ownId),
    validUpdate(thirdId),
  ]);
  assert.equal(stored.has(ownId), false);
  assert.equal(stored.has(thirdId), true);
});

test("task.reschedule increments the counter only when the due date moves", async () => {
  const rows: TaskRec[] = [
    {
      id: ownId,
      user_id: "user-1",
      title: "להזמין אוכל לכלב",
      due_on: "2026-09-10",
      due_at: null,
      reminder_enabled: true,
      reminder_offset_minutes: null,
      reminder_sent_at: null,
      reminder_claimed_at: null,
      planned_start_at: null,
      planned_end_at: null,
      reschedule_count: 0,
      last_rescheduled_at: null,
    },
  ];
  const same = await executeAction(
    tasksDb(rows),
    "user-1",
    action({ due_on: "2026-09-10" }),
  );
  assert.equal(same.ok, true);
  assert.equal(rows[0]?.reschedule_count, 0);
  assert.equal(rows[0]?.last_rescheduled_at, null);

  const moved = await executeAction(
    tasksDb(rows),
    "user-1",
    action({ due_on: "2026-09-12" }),
  );
  assert.equal(moved.ok, true);
  assert.equal(rows[0]?.reschedule_count, 1);
  assert.equal(typeof rows[0]?.last_rescheduled_at, "string");
});

test("forgotten blocks task actions but keeps consequence updates", () => {
  const scoped = applySurfaceTurnPolicy({
    surface: "forgotten",
    actions: [action({ type: "task.create", title: "משימה חדשה" })],
    presentation: { type: "task_list", task_ids: [ownId] },
    consequence_updates: [validUpdate()],
  });
  assert.deepEqual(scoped.actions, []);
  assert.deepEqual(scoped.consequence_updates, [validUpdate()]);
});

test("forgotten presentation caps at 6 open tasks and drops closed or duplicate ids", () => {
  const tasks = [
    task({ id: ownId, title: "אחת" }),
    task({ id: otherId, title: "שתיים" }),
    task({ id: thirdId, title: "שלוש" }),
    task({
      id: "44444444-4444-4444-8444-444444444444",
      title: "ארבע",
    }),
    task({
      id: "55555555-5555-4555-8555-555555555555",
      title: "חמש",
    }),
    task({
      id: "66666666-6666-4666-8666-666666666666",
      title: "שש",
    }),
    task({
      id: "77777777-7777-4777-8777-777777777777",
      title: "שבע",
    }),
    task({
      id: "88888888-8888-4888-8888-888888888888",
      title: "סגורה",
      status: "done",
    }),
  ];
  const resolved = resolveAgentPresentation(
    {
      type: "task_list",
      task_ids: [
        tasks[0]!.id,
        tasks[0]!.id,
        tasks[7]!.id,
        tasks[1]!.id,
        tasks[2]!.id,
        tasks[3]!.id,
        tasks[4]!.id,
        tasks[5]!.id,
        tasks[6]!.id,
      ],
    },
    tasks,
    new Date(),
    "forgotten",
  );
  assert.equal(resolved?.type, "task_list");
  if (resolved?.type !== "task_list") return;
  assert.equal(resolved.tasks.length, 6);
  assert.deepEqual(
    resolved.tasks.map((item) => item.id),
    tasks.slice(0, 6).map((item) => item.id),
  );
  assert.ok(!resolved.tasks.some((item) => item.status !== "open"));
});

test("a task without a consequence can still be presented if the model chose it", () => {
  const chosen = task({ id: ownId, title: "כביסה" });
  const resolved = resolveAgentPresentation(
    { type: "task_list", task_ids: [ownId] },
    [chosen],
    new Date(),
    "forgotten",
  );
  assert.equal(resolved?.type, "task_list");
  if (resolved?.type === "task_list") {
    assert.equal(resolved.tasks[0]?.title, "כביסה");
  }
});

test("other surfaces keep a generic task_list above 6 items", () => {
  const tasks = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
    "44444444-4444-4444-8444-444444444444",
    "55555555-5555-4555-8555-555555555555",
    "66666666-6666-4666-8666-666666666666",
    "77777777-7777-4777-8777-777777777777",
    "88888888-8888-4888-8888-888888888888",
  ].map((id, index) => task({ id, title: `משימה ${index + 1}` }));
  const resolved = resolveAgentPresentation(
    { type: "task_list", task_ids: tasks.map((item) => item.id) },
    tasks,
  );
  assert.equal(resolved?.type, "task_list");
  if (resolved?.type === "task_list") assert.equal(resolved.tasks.length, 8);
});

test("agent context includes reschedule facts and an existing consequence without ranking", () => {
  const open = task({
    id: ownId,
    title: "להזמין אוכל לכלב",
    reschedule_count: 2,
    last_rescheduled_at: "2026-09-10T10:00:00.000Z",
  });
  const consequence: ConsequenceRow = {
    task_id: ownId,
    user_id: "user-1",
    severity: "medium",
    reason: "המשך דחייה עלול להביא למחסור",
    confidence: "medium",
    basis: { kind: "inferred" },
    valid_until: null,
    created_at: "2026-09-09T00:00:00.000Z",
    updated_at: "2026-09-10T00:00:00.000Z",
  };
  const text = buildInstructions({
    tasks: [open],
    memory: [],
    consequences: new Map([[ownId, consequence]]),
    now: new Date("2026-09-10T17:50:00.000Z"),
  });
  assert.match(text, /reschedule_count 2/);
  assert.match(text, /last_rescheduled_at 2026-09-10T10:00:00.000Z/);
  assert.match(text, /created_at 2026-09-10T00:00:00.000Z/);
  assert.match(text, /consequence severity=medium/);
  assert.doesNotMatch(text, /score/);
  assert.doesNotMatch(text, /אם נדחה 3 פעמים/);
});
