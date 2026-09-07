import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Domain 14 — architecture gate: new semantic paths must not grow phrase brains.
 * Allowed: technical markers, UUID/date validation, First Scan heuristic fallback file.
 */
const FORBIDDEN_PATTERNS = [
  {
    file: "lib/agent/semantic.ts",
    mustNotMatch: [
      /text\.includes\(/,
      /סיימתי|גמרתי עם|תזכירי לי/,
    ],
  },
  {
    file: "lib/domain/forecast/index.ts",
    mustNotMatch: [
      /PRODUCT_REGEX|REPLENISHMENT_WORDS|DEPLETION_PHRASES/,
      /includes\(["']הזמנתי/,
    ],
  },
  {
    file: "lib/domain/learning/pace.ts",
    mustNotMatch: [/includes\(|RegExp|\/.*סיימ/],
  },
  {
    file: "lib/domain/notifications/policy.ts",
    mustNotMatch: [/includes\(|\/[א-ת]/],
  },
];

test("domain14: new semantic/forecast/pace/policy paths avoid phrase NLP", () => {
  for (const rule of FORBIDDEN_PATTERNS) {
    const src = readFileSync(join(process.cwd(), rule.file), "utf8");
    for (const re of rule.mustNotMatch) {
      assert.equal(
        re.test(src),
        false,
        `${rule.file} matched forbidden pattern ${re}`,
      );
    }
  }
});

test("domain14: first-scan heuristic remains a separate fallback module", () => {
  const semantic = readFileSync(
    join(process.cwd(), "lib/domain/first-scan/semantic.ts"),
    "utf8",
  );
  assert.match(semantic, /analyzeScanText/);
  assert.match(semantic, /fallback|Heuristic|heuristic/i);
});
