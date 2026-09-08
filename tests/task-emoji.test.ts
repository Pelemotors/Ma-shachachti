import assert from "node:assert/strict";
import { test } from "node:test";
import { emojiForTask } from "../lib/task-emoji";

test("emojiForTask prefers title keywords over category", () => {
  assert.equal(emojiForTask("לפנות מדיח", "unclassified"), "🍽️");
  assert.equal(emojiForTask("למצוא גנן", "unclassified"), "🌿");
  assert.equal(emojiForTask("לטאטא בחדרי הילדים", "children_daily"), "🧹");
  assert.equal(emojiForTask("תיקון באגים באפליקציה", "unclassified"), "💻");
  assert.equal(emojiForTask("הכנת אוכל לבית", "unclassified"), "🍲");
  assert.equal(emojiForTask("להתקשר לאמא", "unclassified"), "📞");
});

test("emojiForTask falls back to category then pin", () => {
  assert.equal(emojiForTask("משהו כללי", "laundry"), "🧺");
  assert.equal(emojiForTask("משהו כללי", "unclassified"), "📌");
  assert.equal(emojiForTask("", "car"), "🚗");
});
