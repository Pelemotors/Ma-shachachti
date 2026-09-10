import assert from "node:assert/strict";
import { test } from "node:test";
import {
  composeReply,
  inspectActions,
  parseDecision,
} from "../lib/action-schema.ts";

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
  const reply = composeReply("הוספתי משימה ליום הורים.", []);
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
    JSON.stringify({ reply: "אבקש לשמור משימה.", actions: [] }),
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.actions, []);
});
