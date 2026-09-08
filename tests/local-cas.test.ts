import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, migrateState } from "../lib/model";
import { applyActions } from "../lib/engine";
import {
  fingerprintState,
  localStoredConflictsWith,
} from "../lib/persistence/local-cas";

test("local CAS: raw string must not be compared to migrated fingerprint", () => {
  const state = emptyState();
  // Extra key survives in raw LS but is stripped by migrate/Zod — old CAS blocked saves.
  const raw = JSON.stringify({ ...state, _legacyExtra: "x" });
  const migrated = migrateState(JSON.parse(raw));

  assert.notEqual(raw, fingerprintState(migrated));
  assert.equal(localStoredConflictsWith(raw, migrated), false);
});

test("local CAS: detects real cross-tab divergence", () => {
  const base = emptyState();
  const other = applyActions(base, [
    { type: "task.create", task: { title: "משימה אחרת", kind: "task" } },
  ]);
  const stored = fingerprintState(other);
  assert.equal(localStoredConflictsWith(stored, base), true);
  assert.equal(localStoredConflictsWith(stored, other), false);
});

test("local CAS: empty storage is not a conflict", () => {
  assert.equal(localStoredConflictsWith(null, emptyState()), false);
});
