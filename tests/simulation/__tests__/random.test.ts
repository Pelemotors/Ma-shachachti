import assert from "node:assert/strict";
import { test } from "node:test";
import { DeterministicRandom } from "../runner/deterministic-random.ts";

test("same seed yields the same sequence", () => {
  const a = new DeterministicRandom(1001);
  const b = new DeterministicRandom(1001);
  const seqA = [a.next(), a.next(), a.nextInt(10), a.pick(["x", "y", "z"])];
  const seqB = [b.next(), b.next(), b.nextInt(10), b.pick(["x", "y", "z"])];
  assert.deepEqual(seqA, seqB);
});

test("different seeds diverge", () => {
  const a = new DeterministicRandom(1001);
  const b = new DeterministicRandom(1002);
  assert.notEqual(a.next(), b.next());
});
