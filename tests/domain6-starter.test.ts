import test from "node:test";
import assert from "node:assert/strict";
import { emptyState } from "../lib/model";
import {
  getStarterTemplates,
  shouldUseStarterMode,
} from "../lib/domain/starter";

test("domain6: starter covers core areas without inventing deep cleans", () => {
  const profile = emptyState().profile;
  const items = getStarterTemplates(profile);
  assert.ok(items.length >= 5);
  assert.ok(!items.some((i) => /תנור|מקרר|מיקרוגל|ניקיון עומק/.test(i.title)));
  assert.equal(shouldUseStarterMode(emptyState()), true);
});
