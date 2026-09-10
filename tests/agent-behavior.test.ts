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

test("agent stays a home-operations assistant, not a general chatbot", () => {
  assert.match(
    instructions,
    /הסוכן האישי של המשתמש לניהול הבית והחיים התפעוליים שסביבו/,
  );
  assert.match(instructions, /אל תהפוך לעוזר כללי/);
});

test("out-of-scope car buying is not answered as product advice", () => {
  assert.match(instructions, /איזה רכב כדאי לקנות בישראל\?/);
  assert.match(instructions, /מחוץ לתחום/);
  assert.match(instructions, /אל תענה תשובה מלאה/);
  assert.match(instructions, /אל תנסה בכוח למצוא קשר לניהול הבית/);
});

test("operational car test reminder stays in scope", () => {
  assert.match(instructions, /תזכיר לי לעשות טסט לרכב/);
  assert.match(instructions, /טיפול, טסט, ביטוח או תיקון/);
});

test("thanks follow-ups must not repeat the previous action", () => {
  assert.match(instructions, /תודה/);
  assert.match(instructions, /סבבה/);
  assert.match(instructions, /אל תחזור על action מה-turn הקודם/);
  assert.match(instructions, /actions: \[\]/);
  assert.doesNotMatch(actionsSrc, /תודה|סבבה|מעולה|אחלה|אוקיי/);
  assert.doesNotMatch(schemaSrc, /תודה|סבבה|מעולה|אחלה|אוקיי/);
});

test("thinking work is not bounced back to the user", () => {
  assert.match(instructions, /מה שכחתי\?/);
  assert.match(instructions, /מה אתה בדרך כלל צריך לעשות\?/);
  assert.match(instructions, /קודם השתמש במה שכבר קיים/);
});
