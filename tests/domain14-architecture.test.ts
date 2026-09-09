import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Domain 14 — production agent path must not grow phrase brains.
 */
const FORBIDDEN_PATTERNS = [
  {
    file: "lib/agent/semantic.ts",
    mustNotMatch: [/text\.includes\(/, /סיימתי|גמרתי עם|תזכירי לי/],
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
  {
    file: "lib/domain/first-scan/ai.ts",
    mustNotMatch: [/analyzeScanText/, /analyzeFirstScan\(/],
  },
  {
    file: "lib/domain/first-scan/semantic.ts",
    mustNotMatch: [/analyzeScanText/],
  },
  {
    file: "components/demo-reply.ts",
    mustNotMatch: [/\.test\(/, /אולי\\s/, /סיימתי|לא היום/],
  },
];

test("domain14: semantic/forecast/pace/policy paths avoid phrase NLP", () => {
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

test("domain14: first-scan heuristic isolated from production semantic modules", () => {
  const ai = readFileSync(
    join(process.cwd(), "lib/domain/first-scan/ai.ts"),
    "utf8",
  );
  assert.doesNotMatch(ai, /analyzeScanText/);
  const semantic = readFileSync(
    join(process.cwd(), "lib/domain/first-scan/semantic.ts"),
    "utf8",
  );
  assert.doesNotMatch(semantic, /analyzeScanText/);
});
