import assert from "node:assert/strict";
import { test } from "node:test";
import {
  composeReply,
  inspectActions,
  parseDecision,
} from "../lib/action-schema.ts";
import { executeAction } from "../lib/actions.ts";
import { isExactOpenDuplicate } from "../lib/task-identity.ts";
import type { AgentAction } from "../lib/types.ts";

const datetimeCreate = {
  type: "task.create",
  id: null,
  title: "יום הורים",
  notes: null,
  due_on: "2026-10-23T17:00:00",
  kind: null,
  content: null,
  confidence: null,
};

function createAction(
  partial: Partial<AgentAction> & Pick<AgentAction, "title">,
): AgentAction {
  return {
    type: "task.create",
    id: null,
    notes: null,
    due_on: null,
    due_time: null,
    due_patch: null,
    reminder_enabled: null,
    reminder_offset_minutes: null,
    reminder_patch: null,
    plan_patch: null,
    planned_date: null,
    planned_start_time: null,
    planned_end_time: null,
    silent: null,
    kind: null,
    content: null,
    confidence: null,
    ...partial,
  };
}

type TaskRec = {
  id: string;
  user_id: string;
  title: string;
  notes: string;
  due_on: string | null;
  due_at: string | null;
  status: string;
};

function tasksDb(rows: TaskRec[]) {
  let inserts = 0;
  const db = {
    from() {
      let op: "select" | "insert" = "select";
      const api = {
        select() {
          return api;
        },
        eq() {
          return api;
        },
        limit() {
          return api;
        },
        insert(payload: Record<string, unknown>) {
          op = "insert";
          inserts += 1;
          const created: TaskRec = {
            id: `created-${inserts}`,
            user_id: String(payload.user_id),
            title: String(payload.title),
            notes: String(payload.notes ?? ""),
            due_on: (payload.due_on as string | null) ?? null,
            due_at: (payload.due_at as string | null) ?? null,
            status: "open",
          };
          rows.push(created);
          api.created = created;
          return api;
        },
        created: undefined as TaskRec | undefined,
        async single() {
          return { data: { id: api.created?.id }, error: null };
        },
        then(
          resolve: (value: { data: TaskRec[]; error: null }) => unknown,
          reject?: (reason: unknown) => unknown,
        ) {
          const data =
            op === "select"
              ? rows.filter((row) => row.status === "open")
              : rows;
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return api;
    },
  };
  return { db: db as never, inserts: () => inserts, rows };
}

test("invalid due_on is a failure, not a silent drop", () => {
  const inspected = inspectActions([datetimeCreate]);
  assert.equal(inspected.accepted.length, 0);
  assert.equal(inspected.results.length, 1);
  assert.equal(inspected.results[0]?.ok, false);
  assert.match(
    String(
      inspected.results[0] && !inspected.results[0].ok
        ? inspected.results[0].error
        : "",
    ),
    /תאריך/,
  );
});

test("composeReply ignores the model success claim when the action was rejected", () => {
  const inspected = inspectActions([datetimeCreate]);
  const reply = composeReply("הוספתי משימה ליום הורים.", inspected.results);
  assert.doesNotMatch(reply, /הוספתי/);
  assert.match(reply, /תאריך|לא /);
});

test("empty actions keep the conversational reply", () => {
  const inspected = inspectActions([]);
  assert.equal(inspected.accepted.length, 0);
  assert.equal(inspected.results.length, 0);
  assert.equal(
    composeReply("אפשר לספר לי מה פתוח אצלך.", inspected.results),
    "אפשר לספר לי מה פתוח אצלך.",
  );
});

test("valid task.create is accepted", () => {
  const inspected = inspectActions([
    {
      type: "task.create",
      id: null,
      title: "יום הורים",
      notes: "17:00",
      due_on: "2026-10-23",
      kind: null,
      content: null,
      confidence: null,
    },
  ]);
  assert.equal(inspected.results.length, 0);
  assert.equal(inspected.accepted[0]?.title, "יום הורים");
  assert.equal(inspected.accepted[0]?.due_on, "2026-10-23");
});

test("empty actions with an execution claim are not shown as success", () => {
  const reply = composeReply("הוספתי לך את המשימה", []);
  assert.doesNotMatch(reply, /הוספתי|שמרתי|עדכנתי|מחקתי|סימנתי|קבעתי|אזכיר/);
  assert.equal(reply, "לא בוצעה פעולה במערכת.");
});

test("successful action keeps extra conversational text that does not claim execution", () => {
  const reply = composeReply("אין לי יכולת לקבוע התראה לשעה 17:00.", [
    {
      ok: true,
      type: "task.create",
      title: "יום הורים",
      due_on: "2026-10-23",
    },
  ]);
  assert.match(reply, /שמרתי את המשימה "יום הורים" לתאריך 23\/10\/2026/);
  assert.match(reply, /אין לי יכולת לקבוע התראה לשעה 17:00/);
});

test("successful result text is built from execution, not from the model claim", () => {
  const reply = composeReply("הוספתי את זה. אין תזכורת לשעה.", [
    { ok: true, type: "task.create", title: "יום הורים", due_on: "2026-10-23" },
  ]);
  assert.match(reply, /שמרתי את המשימה "יום הורים" לתאריך 23\/10\/2026/);
  assert.match(reply, /אין תזכורת לשעה/);
  assert.doesNotMatch(reply, /הוספתי/);
});

test("parseDecision rejects unstructured text", () => {
  const parsed = parseDecision("הוספתי לך משימה ליום הורים");
  assert.equal(parsed.ok, false);
});

test("parseDecision accepts a structured turn", () => {
  const parsed = parseDecision(
    JSON.stringify({
      reply: "אבקש לשמור משימה.",
      actions: [],
      presentation: null,
    }),
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.actions, []);
    assert.equal(parsed.presentation, null);
  }
});

test("rejected action never becomes a success confirmation", () => {
  const reply = composeReply("שמרתי וגם דחיתי את זה.", [
    { ok: false, type: "task.create", error: "חסר שם למשימה." },
  ]);
  assert.equal(reply, "חסר שם למשימה.");
  assert.doesNotMatch(reply, /שמרתי|דחיתי|הוספתי/);
});

test("existing exact open task is not inserted again", async () => {
  const fixture: TaskRec[] = [
    {
      id: "task-1",
      user_id: "user-1",
      title: "לקנות חלב",
      notes: "",
      due_on: "2026-09-11",
      status: "open",
    },
  ];
  const { db, inserts } = tasksDb(fixture);
  const result = await executeAction(
    db,
    "user-1",
    createAction({ title: "  לקנות   חלב ", due_on: "2026-09-11" }),
  );
  assert.equal(inserts(), 0);
  assert.equal(fixture.length, 1);
  assert.deepEqual(result, {
    ok: true,
    type: "task.create",
    id: "task-1",
    title: "לקנות חלב",
    due_on: "2026-09-11",
    due_time: null,
    alreadyExists: true,
  });
  const reply = composeReply("הוספתי לך את המשימה", [result]);
  assert.match(reply, /המשימה "לקנות חלב" כבר קיימת/);
  assert.doesNotMatch(reply, /הוספתי|שמרתי את המשימה/);
});

test("similar but not identical tasks are both allowed", async () => {
  const fixture: TaskRec[] = [
    {
      id: "task-1",
      user_id: "user-1",
      title: "לקנות חלב",
      notes: "",
      due_on: null,
      status: "open",
    },
  ];
  const { db, inserts } = tasksDb(fixture);
  const result = await executeAction(
    db,
    "user-1",
    createAction({ title: "לקנות חלב לאמא" }),
  );
  assert.equal(result.ok, true);
  assert.equal(inserts(), 1);
  assert.equal(fixture.length, 2);
  assert.equal(
    isExactOpenDuplicate(fixture[0]!, { title: "לקנות חלב לאמא" }),
    false,
  );
});

test("same title with a different due_on is a different task", async () => {
  const fixture: TaskRec[] = [
    {
      id: "task-1",
      user_id: "user-1",
      title: "להתקשר לרופא",
      notes: "",
      due_on: "2026-09-14",
      status: "open",
    },
  ];
  const { db, inserts } = tasksDb(fixture);
  const result = await executeAction(
    db,
    "user-1",
    createAction({ title: "להתקשר לרופא", due_on: "2026-09-15" }),
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.alreadyExists, undefined);
  assert.equal(inserts(), 1);
  assert.equal(fixture.length, 2);
});

test("cancelled and done rows do not block a new open task", async () => {
  const fixture: TaskRec[] = [
    {
      id: "old-cancelled",
      user_id: "user-1",
      title: "לקנות חלב",
      notes: "",
      due_on: null,
      status: "cancelled",
    },
    {
      id: "old-done",
      user_id: "user-1",
      title: "לקנות חלב",
      notes: "",
      due_on: null,
      status: "done",
    },
  ];
  const { db, inserts } = tasksDb(fixture);
  const result = await executeAction(
    db,
    "user-1",
    createAction({ title: "לקנות חלב" }),
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.alreadyExists, undefined);
  assert.equal(inserts(), 1);
});
