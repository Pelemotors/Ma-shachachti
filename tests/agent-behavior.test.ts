import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { AGENT_INSTRUCTIONS } from "../lib/agent/instructions.ts";

const instructions = AGENT_INSTRUCTIONS;
const actionsSrc = readFileSync(
  new URL("../lib/actions.ts", import.meta.url),
  "utf8",
);
const schemaSrc = readFileSync(
  new URL("../lib/action-schema.ts", import.meta.url),
  "utf8",
);

test("agent stays a personal home-operations agent", () => {
  assert.match(
    instructions,
    /הסוכן האישי של המשתמש לניהול הבית והחיים התפעוליים שסביבו/,
  );
  assert.match(instructions, /להפחית מהמשתמש עומס מחשבתי/);
});

test("the agent is the brain and code does not infer intent", () => {
  assert.match(instructions, /אתה שכבת החשיבה של המערכת/);
  assert.match(instructions, /הקוד לא אמור להחליט את הדברים האלה במקומך/);
  assert.match(instructions, /אל תעבוד לפי מילות מפתח בלבד/);
});

test("runtime capabilities are the source of truth", () => {
  assert.match(instructions, /היכולות שלך מגיעות מה-Runtime/);
  assert.match(instructions, /השתמש רק במה שהמערכת באמת פרסמה/);
});

test("no keyword follow-up router exists in execution code", () => {
  assert.doesNotMatch(actionsSrc, /תודה|סבבה|מעולה|אחלה|אוקיי/);
  assert.doesNotMatch(schemaSrc, /תודה|סבבה|מעולה|אחלה|אוקיי/);
});

test("clarification is only used when it materially matters", () => {
  assert.match(instructions, /שאל רק כאשר פרט חסר באמת/);
  assert.match(instructions, /אל תשאל שוב משהו שכבר ידוע/);
});
