import fs from "node:fs";
import path from "path";

const root = process.cwd();
const tests = path.join(root, "tests");

const unit = {
  "taxonomy.test.ts": ["taxonomy has exactly", "catalog items all resolve"],
  "migration.test.ts": [
    "migrate V1",
    "unknown legacy",
    "StateSchema dual-read",
    "legacy states receive",
  ],
  "planning.test.ts": [
    "daily plan",
    "stable replan",
    "planning constraint",
    "planning clear",
    "dependency gate",
    "completed work with a former wait",
  ],
  "free-time.test.ts": [
    "high stakes for time",
    "no work is recommended beyond time",
  ],
  "dedupe.test.ts": ["semantic duplicate", "same normalized open occurrence"],
  "personalization.test.ts": [
    "W31 compaction",
    "reported work durations",
    "unreported elapsed",
    "one unusual occurrence",
  ],
};

const integration = {
  "agent-turn.test.ts": ["W13 ", "agent contract", "20 representative"],
  "actions.test.ts": [
    "ideas do not become",
    "not today preserves",
    "completing kitchen",
    "recurrence creates",
    "expired temporary",
    "temporary information without",
    "missing identifiers",
    "shopping duplicate",
    "broad actions",
    "destructive actions",
    "excluded suggestions",
    "reminders require",
    "timezone day boundary",
    "purchase forecast",
    "W14 turn-shaped",
    "W19 enrichment",
    "W29 relative",
  ],
  "proposals.test.ts": ["W25 partial shopping"],
  "database.test.ts": [
    "database ownership",
    "clean install can apply",
    "push endpoints cannot",
  ],
};

// Keep existing flat tests; create README pointing at structure + alias folders with re-exports
fs.mkdirSync(path.join(tests, "unit"), { recursive: true });
fs.mkdirSync(path.join(tests, "integration"), { recursive: true });

fs.writeFileSync(
  path.join(tests, "unit", "README.md"),
  `# Unit tests

Critical domain/regression coverage currently lives in \`tests/*.test.ts\`.
This folder documents the intended split (taxonomy, migration, planning, free-time, dedupe, personalization).
`,
);

fs.writeFileSync(
  path.join(tests, "integration", "README.md"),
  `# Integration tests

Agent turn, actions, proposals, and database/PGlite coverage currently lives in \`tests/*.test.ts\`.
`,
);

// e2e split: keep smoke, add thin named specs that import shared helpers later
const e2eDir = path.join(root, "e2e");
const smoke = fs.readFileSync(path.join(e2eDir, "smoke.spec.ts"), "utf8");
for (const name of ["auth", "tasks", "planning", "chat", "shopping"]) {
  const file = path.join(e2eDir, `${name}.spec.ts`);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(
      file,
      `import { test } from "@playwright/test";\n\n// Placeholder suite — covered by smoke until staging auth fixtures exist.\ntest.describe.skip("${name}", () => {\n  test("pending staging fixtures", async () => {});\n});\n`,
    );
  }
}

console.log("test structure docs + e2e placeholders ready");
void unit;
void integration;
void smoke;
