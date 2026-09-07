import fs from "node:fs";

const p =
  "C:/Users/iraka/.cursor/projects/c-Users-iraka-OneDrive-mashachachti/agent-transcripts/3c9c586f-91b5-44a4-b89a-9eec85d7c7c8/3c9c586f-91b5-44a4-b89a-9eec85d7c7c8.jsonl";
const lines = fs.readFileSync(p, "utf8").split(/\n/);
let best = null;
let bestLen = 0;
for (const line of lines) {
  if (!line.includes("migrateV1ToV2")) continue;
  if (!line.includes("model.ts")) continue;
  try {
    const j = JSON.parse(line);
    const parts = j.message?.content || [];
    for (const c of parts) {
      const contents = c.input?.contents;
      if (
        c.type === "tool_use" &&
        c.name === "Write" &&
        typeof contents === "string" &&
        contents.includes("migrateV1ToV2") &&
        contents.includes("StateV2Schema") &&
        contents.length > bestLen
      ) {
        best = contents;
        bestLen = contents.length;
      }
    }
  } catch {
    // ignore
  }
}
if (!best) {
  console.error("model contents not found in transcript");
  process.exit(1);
}

fs.mkdirSync("lib/model", { recursive: true });
const body = best.replace('from "./taxonomy"', 'from "../taxonomy"');

// Apply post-W15 typing improvement for StateSchema
const patched = body.includes("parse: (raw: unknown): AppState")
  ? body
  : body.replace(
      `export const StateSchema = {
  parse: (raw: unknown) => migrateState(raw),
  safeParse: (raw: unknown) => {
    try {
      return { success: true as const, data: migrateState(raw) };
    } catch (error) {
      return { success: false as const, error };
    }
  },
};`,
      `export const StateSchema = {
  parse: (raw: unknown): AppState => migrateState(raw),
  safeParse: (
    raw: unknown,
  ):
    | { success: true; data: AppState }
    | { success: false; error: unknown } => {
    try {
      return { success: true as const, data: migrateState(raw) };
    } catch (error) {
      return { success: false as const, error };
    }
  },
};`,
    );

fs.writeFileSync("lib/model/index.ts", patched);
fs.writeFileSync("lib/model.ts", 'export * from "./model/index";\n');

// Real split modules that OWN the code would be better; for now keep logic in index
// and make named files re-export from dedicated internal files without cycles:
const reexports = {
  "lib/model/common.ts": `export {
  legacyCategories,
  categories,
  CategorySchema,
  LegacyCategorySchema,
  StatusSchema,
  ReminderUrgencySchema,
  normalize,
} from "./index";
`,
  "lib/model/task.ts": `export {
  PreferredWindowSchema,
  ClassificationSchema,
  TaskSchema,
  type Task,
} from "./index";
`,
  "lib/model/planning.ts": `export {
  PlanningConstraintSchema,
  DailyPlanItemSchema,
  DailyPlanSessionSchema,
  type PlanningConstraint,
  type DailyPlanItem,
  type DailyPlanSession,
} from "./index";
`,
  "lib/model/shopping.ts": `export { ShoppingSchema, ReminderSchema } from "./index";
`,
  "lib/model/memory.ts": `export { FactSchema, MessageSchema, CompactedMemorySchema } from "./index";
`,
  "lib/model/household.ts": `export {
  ProfileSchema,
  HouseholdMemberSchema,
  type Profile,
  type HouseholdMember,
} from "./index";
`,
  "lib/model/personalization.ts": `export {
  SuggestionHistorySchema,
  LearningInsightSchema,
  OperationSchema,
} from "./index";
`,
  "lib/model/proposal.ts": `/** Proposal wire types live under lib/agent and lib/contracts. */
export {};
`,
  "lib/model/actions.ts": `export { ActionSchema, ActionBatch, type Action } from "./index";
`,
  "lib/model/state-v1.ts": `export { StateV1Schema, type StateV1 } from "./index";
`,
  "lib/model/state-v2.ts": `export { StateV2Schema, emptyState, type AppState } from "./index";
`,
  "lib/model/migrate.ts": `export { migrateV1ToV2, migrateState, StateSchema } from "./index";
`,
};

// index should NOT import the thin reexport files (would cycle). Keep index as implementation.
fs.writeFileSync(
  "lib/model/index.ts",
  patched +
    `\n// Named entrypoints: import from ./common, ./task, etc. (re-export wrappers).\n`,
);

for (const [file, content] of Object.entries(reexports)) {
  fs.writeFileSync(file, content);
}

console.log(
  "restored",
  patched.length,
  "chars;",
  patched.split(/\n/).length,
  "lines",
);
