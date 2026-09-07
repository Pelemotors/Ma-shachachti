import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const abs = (...p) => path.join(root, ...p);
const write = (rel, content) => {
  const file = abs(rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log("W", rel, content.split(/\n/).length);
};

// I05 — model split: move body to lib/model/index.ts
const modelSrc = fs.readFileSync(abs("lib/model.ts"), "utf8");
if (!modelSrc.includes('export * from "./model/index"')) {
  write(
    "lib/model/index.ts",
    modelSrc.replace('from "./taxonomy"', 'from "../taxonomy"'),
  );
  write("lib/model.ts", 'export * from "./model/index";\n');
}

// Named re-export modules for public structure (point to index slices via re-exports)
write(
  "lib/model/common.ts",
  `export {
  legacyCategories,
  categories,
  CategorySchema,
  LegacyCategorySchema,
  StatusSchema,
  ReminderUrgencySchema,
  normalize,
} from "./index";
`,
);
write(
  "lib/model/task.ts",
  `export {
  PreferredWindowSchema,
  ClassificationSchema,
  TaskSchema,
  type Task,
} from "./index";
`,
);
write(
  "lib/model/planning.ts",
  `export {
  PlanningConstraintSchema,
  DailyPlanItemSchema,
  DailyPlanSessionSchema,
  type PlanningConstraint,
  type DailyPlanItem,
  type DailyPlanSession,
} from "./index";
`,
);
write(
  "lib/model/shopping.ts",
  `export { ShoppingSchema, ReminderSchema } from "./index";
`,
);
write(
  "lib/model/memory.ts",
  `export { FactSchema, MessageSchema, CompactedMemorySchema } from "./index";
`,
);
write(
  "lib/model/household.ts",
  `export {
  ProfileSchema,
  HouseholdMemberSchema,
  type Profile,
  type HouseholdMember,
} from "./index";
`,
);
write(
  "lib/model/personalization.ts",
  `export {
  SuggestionHistorySchema,
  LearningInsightSchema,
  OperationSchema,
} from "./index";
`,
);
write(
  "lib/model/proposal.ts",
  `/** Proposal persistence shapes live in contracts/agent; AppState holds operations only. */
export {};
`,
);
write(
  "lib/model/actions.ts",
  `export { ActionSchema, ActionBatch, type Action } from "./index";
`,
);
write(
  "lib/model/state-v1.ts",
  `export { StateV1Schema, type StateV1 } from "./index";
`,
);
write(
  "lib/model/state-v2.ts",
  `export { StateV2Schema, emptyState, type AppState } from "./index";
`,
);
write(
  "lib/model/migrate.ts",
  `export { migrateV1ToV2, migrateState, StateSchema } from "./index";
`,
);

console.log("model structure ok");
