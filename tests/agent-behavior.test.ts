import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  AGENT_CORE_INSTRUCTIONS,
  AGENT_MODE_INSTRUCTIONS,
} from "../lib/agent/instructions.ts";

const instructions = AGENT_CORE_INSTRUCTIONS;
const actionsSrc = readFileSync(
  new URL("../lib/actions.ts", import.meta.url),
  "utf8",
);
const schemaSrc = readFileSync(
  new URL("../lib/action-schema.ts", import.meta.url),
  "utf8",
);

test("agent stays a personal home-operations agent", () => {
  assert.match(instructions, /הסוכן האישי של המשתמש לניהול העומס התפעולי/);
  assert.match(instructions, /להפחית ממנו את הצורך לזכור/);
});

test("the agent is the brain and code does not infer intent", () => {
  assert.match(instructions, /אתה המוח, המערכת היא הידיים/);
  assert.match(instructions, /אל תיתן למבנה הנתונים/);
  assert.match(instructions, /אל תבחר פעולה רק בגלל מילה מסוימת/);
});

test("runtime capabilities stay outside the core constitution", () => {
  assert.doesNotMatch(instructions, /היכולות שלך מגיעות מה-Runtime/);
  assert.match(
    AGENT_MODE_INSTRUCTIONS.forgotten,
    /מה שכחתי/,
  );
});

test("no keyword follow-up router exists in execution code", () => {
  assert.doesNotMatch(actionsSrc, /תודה|סבבה|מעולה|אחלה|אוקיי/);
  assert.doesNotMatch(schemaSrc, /תודה|סבבה|מעולה|אחלה|אוקיי/);
});

test("clarification is only used when it materially matters", () => {
  assert.match(instructions, /שאל רק כאשר מידע חסר באמת/);
  assert.match(instructions, /אל תמציא/);
});
