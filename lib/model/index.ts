import { z } from "zod";
import { CATEGORY_IDS, CategoryId, classifyLegacyCategory } from "../taxonomy";

/** Legacy V1 flat Hebrew categories (migration only). */
export const legacyCategories = [
  "מטבח",
  "סלון",
  "כביסה",
  "רצפות",
  "מקלחת ושירותים",
  "מצעים",
  "ילדים",
  "גינה וחצר",
  "קניות",
  "חיות מחמד",
  "רכב",
  "בריאות ותורים",
  "מסמכים ואדמיניסטרציה",
  "איפוס בית",
  "שונות / לא מסווג",
] as const;

/** @deprecated Prefer CategoryId from taxonomy — kept for catalog typing during transition */
export const categories = legacyCategories;
export const CategorySchema = z.enum(CATEGORY_IDS);
export const LegacyCategorySchema = z.enum(legacyCategories);

export const StatusSchema = z.enum([
  "open",
  "done",
  "cancelled",
  "unknown",
  "in_progress",
]);
export const ReminderUrgencySchema = z.enum(["urgent", "medium", "low"]);
const Stamp = z.string().datetime({ offset: true });
const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const PreferredWindowSchema = z
  .object({
    start: Stamp.nullable().optional(),
    end: Stamp.nullable().optional(),
  })
  .nullable();

export const ClassificationSchema = z.object({
  source: z.enum(["user", "agent", "catalog", "migration", "learned"]),
  confidence: z.enum(["high", "medium", "unknown"]),
  userOverride: z.boolean(),
});

export const TaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  categoryId: CategorySchema,
  detailTypeId: z.string().max(80).nullable(),
  classification: ClassificationSchema.default({
    source: "migration",
    confidence: "unknown",
    userOverride: false,
  }),
  enrichmentStatus: z
    .enum(["none", "pending", "done", "failed"])
    .default("none"),
  kind: z.enum(["task", "idea"]),
  status: StatusSchema,
  createdAt: Stamp,
  updatedAt: Stamp,
  dueAt: Stamp.nullable(),
  preferredWindow: PreferredWindowSchema.default(null),
  hiddenUntil: Stamp.nullable(),
  startedAt: Stamp.nullable().default(null),
  workMinutes: z.number().int().min(1).max(1440),
  waitMinutes: z.number().int().min(0).max(1440),
  effort: z.number().int().min(1).max(3),
  priority: z.number().int().min(0).max(3),
  dependsOn: z.array(z.string().uuid()).max(20),
  steps: z
    .array(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(160),
        done: z.boolean(),
      }),
    )
    .max(30),
  templateId: z.string().nullable(),
  recurrenceDays: z.number().int().min(1).max(366).nullable(),
  occurrenceOf: z.string().uuid().nullable(),
  notes: z.string().max(2000),
  completedAt: Stamp.nullable(),
  actualWorkMinutes: z.number().int().min(1).max(1440).nullable(),
  relatedMemberIds: z.array(z.string().uuid()).max(20).default([]),
  homeAreaIds: z.array(z.string().uuid()).max(20).default([]),
});
export type Task = z.infer<typeof TaskSchema>;

export const FactSchema = z.object({
  id: z.string().uuid(),
  text: z.string().min(1).max(500),
  kind: z.enum(["stable", "temporary", "inference"]),
  expiresAt: Stamp.nullable(),
  createdAt: Stamp,
  source: z.enum(["user", "agent"]),
});

export const ShoppingSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(150),
  quantity: z.string().max(60),
  purchasedAt: Stamp.nullable(),
  createdAt: Stamp,
});

export const ReminderSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  dueAt: Stamp,
  status: z.enum(["pending", "cancelled", "sent", "failed"]),
  taskId: z.string().uuid().nullable(),
  urgency: ReminderUrgencySchema.optional(),
});

export const ProfileSchema = z.object({
  name: z.string().max(80),
  addressAs: z.enum(["feminine", "masculine", "neutral"]),
  rooms: z.number().int().min(1).max(30),
  bathrooms: z.number().int().min(1).max(15),
  children: z.number().int().min(0).max(20),
  garden: z.boolean(),
  pets: z.boolean(),
  car: z.boolean(),
  dishwasher: z.boolean(),
  dryer: z.boolean(),
  aiConsent: z.boolean(),
  autoApply: z.boolean(),
  onboarded: z.boolean(),
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "Invalid timezone"),
  quietStart: z.number().int().min(0).max(23),
  quietEnd: z.number().int().min(0).max(23),
});

const BusyWindowSchema = z
  .object({ start: Stamp, end: Stamp })
  .refine(
    (x) => Date.parse(x.end) > Date.parse(x.start),
    "Invalid busy window",
  );
export const PlanningConstraintSchema = z
  .object({
    date: DateKey,
    availableFrom: Stamp.nullable(),
    availableUntil: Stamp.nullable(),
    unavailable: z.array(BusyWindowSchema).max(20),
    effort: z.number().int().min(1).max(3).nullable(),
    note: z.string().max(500),
  })
  .refine(
    (x) =>
      !x.availableFrom ||
      !x.availableUntil ||
      Date.parse(x.availableUntil) > Date.parse(x.availableFrom),
    "Invalid availability window",
  );
export type PlanningConstraint = z.infer<typeof PlanningConstraintSchema>;

export const DailyPlanItemSchema = z.object({
  taskId: z.string().uuid(),
  order: z.number().int().min(0),
  plannedStart: Stamp.nullable(),
  plannedEnd: Stamp.nullable(),
  locked: z.boolean(),
  planStatus: z.enum(["planned", "in_progress", "done", "skipped"]),
});
export type DailyPlanItem = z.infer<typeof DailyPlanItemSchema>;

export const DailyPlanSessionSchema = z.object({
  id: z.string().uuid(),
  date: DateKey,
  createdAt: Stamp,
  updatedAt: Stamp,
  availableMinutes: z
    .number()
    .int()
    .min(1)
    .max(24 * 60),
  effort: z.number().int().min(1).max(3),
  generatedFromRevision: z.number().int().min(0),
  items: z.array(DailyPlanItemSchema).max(200),
});
export type DailyPlanSession = z.infer<typeof DailyPlanSessionSchema>;

export const MessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  text: z.string().max(12000),
  createdAt: Stamp,
  turnId: z.string().uuid().nullable().default(null),
});

export const HouseholdMemberSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  type: z.enum(["adult", "child", "pet", "other"]),
  aliases: z.array(z.string().max(80)).max(20),
  createdAt: Stamp,
  updatedAt: Stamp,
});
export type HouseholdMember = z.infer<typeof HouseholdMemberSchema>;

export const SuggestionHistorySchema = z.object({
  taskId: z.string().uuid(),
  suggestedAt: Stamp,
  selectedAt: Stamp.nullable(),
  declinedAt: Stamp.nullable(),
});

export const LearningInsightSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum([
    "work_time",
    "preferred_window",
    "suggestion_rank",
    "task_combo",
    "correction",
    "duration",
    "forecast",
    "habit_frequency",
  ]),
  key: z.string().max(200),
  payload: z.record(z.string(), z.unknown()),
  samples: z.number().int().min(0),
  confidence: z.enum(["low", "medium", "high"]),
  lastObservedAt: Stamp,
});

export const CompactedMemorySchema = z.object({
  facts: z.array(z.string().max(500)).max(100),
  preferences: z.array(z.string().max(500)).max(100),
  patterns: z.array(z.string().max(500)).max(100),
  updatedAt: Stamp.nullable(),
  lifeAdminWindow: z
    .object({
      preferredStartMinutes: z
        .number()
        .int()
        .min(0)
        .max(24 * 60)
        .nullable(),
      preferredEndMinutes: z
        .number()
        .int()
        .min(0)
        .max(24 * 60)
        .nullable(),
      confidence: z.number().min(0).max(1),
      samples: z.number().int().min(0),
    })
    .default({
      preferredStartMinutes: null,
      preferredEndMinutes: null,
      confidence: 0,
      samples: 0,
    }),
});

export const HomeAreaSchema = z.object({
  id: z.string().uuid(),
  type: z.enum([
    "bedroom",
    "bathroom",
    "kids_room",
    "living",
    "kitchen",
    "guest_toilet",
    "other",
  ]),
  name: z.string().min(1).max(80),
  aliases: z.array(z.string().max(80)).max(20),
  parentAreaId: z.string().uuid().nullable(),
  source: z.enum(["user", "scan", "agent"]),
});
export type HomeArea = z.infer<typeof HomeAreaSchema>;

export const FirstScanStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "completed",
  "skipped",
]);

export const ScanChunkSchema = z.object({
  id: z.string().uuid(),
  text: z.string().max(12000),
  createdAt: Stamp,
  source: z.enum(["text", "voice"]),
});

export const FirstScanSessionSchema = z.object({
  id: z.string().uuid(),
  status: z.enum([
    "not_started",
    "in_progress",
    "review",
    "approved",
    "completed",
    "skipped",
  ]),
  chunks: z.array(ScanChunkSchema).max(40),
  draftAnalysis: z.unknown().nullable().default(null),
  /** Last approved proposal — used for approve idempotency (P34). */
  proposalId: z.string().uuid().nullable().optional().default(null),
  createdAt: Stamp,
  updatedAt: Stamp,
});
export type FirstScanSession = z.infer<typeof FirstScanSessionSchema>;

export const OperationSchema = z.object({
  turnId: z.string().uuid(),
  createdAt: Stamp,
  summary: z.string().max(200),
  actionTypes: z.array(z.string()).max(40),
});

export const StateV2Schema = z.object({
  schemaVersion: z.literal(2),
  profile: ProfileSchema,
  tasks: z.array(TaskSchema).max(2000),
  facts: z.array(FactSchema).max(300),
  shopping: z.array(ShoppingSchema).max(1000),
  reminders: z.array(ReminderSchema).max(500),
  messages: z.array(MessageSchema).max(200),
  excludedTemplates: z.array(z.string()).max(500),
  planning: z
    .object({
      today: PlanningConstraintSchema.nullable(),
      plan: DailyPlanSessionSchema.nullable(),
    })
    .default({ today: null, plan: null }),
  events: z
    .array(
      z.object({
        id: z.string().uuid(),
        at: Stamp,
        type: z.string(),
        summary: z.string(),
        turnId: z.string().uuid().nullable().optional(),
      }),
    )
    .max(500),
  members: z.array(HouseholdMemberSchema).max(50).default([]),
  suggestionHistory: z.array(SuggestionHistorySchema).max(500).default([]),
  learning: z.array(LearningInsightSchema).max(300).default([]),
  compactedMemory: CompactedMemorySchema.default({
    facts: [],
    preferences: [],
    patterns: [],
    updatedAt: null,
    lifeAdminWindow: {
      preferredStartMinutes: null,
      preferredEndMinutes: null,
      confidence: 0,
      samples: 0,
    },
  }),
  operations: z.array(OperationSchema).max(100).default([]),
  homeAreas: z.array(HomeAreaSchema).max(80).default([]),
  firstScan: z
    .object({
      status: FirstScanStatusSchema,
      completedAt: Stamp.nullable().optional(),
      session: FirstScanSessionSchema.nullable().optional(),
    })
    .default({ status: "not_started", completedAt: null, session: null }),
});

export type AppState = z.infer<typeof StateV2Schema>;
export type Profile = z.infer<typeof ProfileSchema>;

const TaskV1Schema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  category: LegacyCategorySchema.optional(),
  categoryId: CategorySchema.optional(),
  detailTypeId: z.string().nullable().optional(),
  kind: z.enum(["task", "idea"]),
  status: z
    .enum(["open", "done", "cancelled", "unknown", "in_progress"])
    .optional(),
  createdAt: Stamp,
  updatedAt: Stamp,
  dueAt: Stamp.nullable(),
  preferredWindow: PreferredWindowSchema.optional(),
  hiddenUntil: Stamp.nullable(),
  startedAt: Stamp.nullable().optional(),
  workMinutes: z.number(),
  waitMinutes: z.number(),
  effort: z.number(),
  priority: z.number(),
  dependsOn: z.array(z.string().uuid()),
  steps: z.array(z.any()),
  templateId: z.string().nullable(),
  recurrenceDays: z.number().nullable(),
  occurrenceOf: z.string().uuid().nullable(),
  notes: z.string(),
  completedAt: Stamp.nullable(),
  actualWorkMinutes: z.number().nullable(),
  classification: ClassificationSchema.optional(),
  enrichmentStatus: z.enum(["none", "pending", "done", "failed"]).optional(),
  relatedMemberIds: z.array(z.string().uuid()).optional(),
});

export const StateV1Schema = z.object({
  schemaVersion: z.literal(1),
  profile: ProfileSchema,
  tasks: z.array(TaskV1Schema).max(2000),
  facts: z.array(FactSchema).max(300),
  shopping: z.array(ShoppingSchema).max(1000),
  reminders: z.array(ReminderSchema).max(500),
  messages: z.array(MessageSchema.partial({ turnId: true })).max(200),
  excludedTemplates: z.array(z.string()).max(500),
  planning: z
    .object({
      today: PlanningConstraintSchema.nullable(),
      plan: DailyPlanSessionSchema.nullable().optional(),
    })
    .optional(),
  events: z.array(z.any()).max(500).optional(),
});

export type StateV1 = z.infer<typeof StateV1Schema>;

function migrateTask(raw: z.infer<typeof TaskV1Schema>): Task {
  const legacy = raw.category ?? "שונות / לא מסווג";
  const categoryId: CategoryId =
    raw.categoryId ?? classifyLegacyCategory(legacy, raw.title, raw.templateId);
  return {
    id: raw.id,
    title: raw.title,
    categoryId,
    detailTypeId: raw.detailTypeId ?? null,
    classification: raw.classification ?? {
      source: "migration",
      confidence: "medium",
      userOverride: false,
    },
    enrichmentStatus: raw.enrichmentStatus ?? "none",
    kind: raw.kind,
    status: (raw.status as Task["status"]) ?? "open",
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    dueAt: raw.dueAt,
    preferredWindow: raw.preferredWindow ?? null,
    hiddenUntil: raw.hiddenUntil,
    startedAt: raw.startedAt ?? null,
    workMinutes: raw.workMinutes,
    waitMinutes: raw.waitMinutes,
    effort: raw.effort,
    priority: raw.priority,
    dependsOn: raw.dependsOn,
    steps: raw.steps,
    templateId: raw.templateId,
    recurrenceDays: raw.recurrenceDays,
    occurrenceOf: raw.occurrenceOf,
    notes: raw.notes,
    completedAt: raw.completedAt,
    actualWorkMinutes: raw.actualWorkMinutes,
    relatedMemberIds: raw.relatedMemberIds ?? [],
    homeAreaIds: (raw as { homeAreaIds?: string[] }).homeAreaIds ?? [],
  };
}

export function migrateV1ToV2(v1: StateV1): AppState {
  return {
    schemaVersion: 2,
    profile: v1.profile,
    tasks: v1.tasks.map(migrateTask),
    facts: v1.facts,
    shopping: v1.shopping,
    reminders: v1.reminders,
    messages: v1.messages.map((m) => ({
      id: m.id!,
      role: m.role!,
      text: m.text!,
      createdAt: m.createdAt!,
      turnId: m.turnId ?? null,
    })),
    excludedTemplates: v1.excludedTemplates,
    planning: {
      today: v1.planning?.today ?? null,
      plan: v1.planning?.plan ?? null,
    },
    events: (v1.events ?? []).map((e: any) => ({
      id: e.id,
      at: e.at,
      type: e.type,
      summary: e.summary,
      turnId: e.turnId ?? null,
    })),
    members: [],
    suggestionHistory: [],
    learning: [],
    compactedMemory: {
      facts: [],
      preferences: [],
      patterns: [],
      updatedAt: null,
      lifeAdminWindow: {
        preferredStartMinutes: v1.profile.children > 0 ? 20 * 60 : null,
        preferredEndMinutes: null,
        confidence: v1.profile.children > 0 ? 0.2 : 0,
        samples: 0,
      },
    },
    operations: [],
    homeAreas: [],
    firstScan: { status: "not_started", completedAt: null, session: null },
  };
}

export function migrateState(raw: unknown): AppState {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    const versionRaw = obj.schemaVersion;
    const version =
      versionRaw === undefined || versionRaw === null
        ? null
        : typeof versionRaw === "number"
          ? versionRaw
          : typeof versionRaw === "string" && /^\d+$/.test(versionRaw)
            ? Number(versionRaw)
            : Number.NaN;

    if (version === 2) {
      return StateV2Schema.parse({ ...obj, schemaVersion: 2 });
    }

    if (version !== null && version !== 1 && !Number.isNaN(version)) {
      throw new Error(`unsupported_schema_version:${version}`);
    }
    if (Number.isNaN(version)) {
      throw new Error("unsupported_schema_version:invalid");
    }

    // V1 or legacy without version / missing planning
    const candidate = { ...obj, schemaVersion: 1 as const };
    const v1 = StateV1Schema.safeParse(candidate);
    if (v1.success) return StateV2Schema.parse(migrateV1ToV2(v1.data));
    // Soft repair: empty planning
    const repaired = {
      ...candidate,
      planning: (obj as { planning?: unknown }).planning ?? { today: null },
    };
    const v1b = StateV1Schema.parse(repaired);
    return StateV2Schema.parse(migrateV1ToV2(v1b));
  }
  return emptyState();
}

/** Public state schema: dual-read via migrateState */
export const StateSchema = z.preprocess(
  (raw) => migrateState(raw),
  StateV2Schema,
) as unknown as typeof StateV2Schema;

export function emptyState(): AppState {
  return {
    schemaVersion: 2,
    profile: {
      name: "",
      addressAs: "feminine",
      rooms: 3,
      bathrooms: 1,
      children: 0,
      garden: false,
      pets: false,
      car: false,
      dishwasher: false,
      dryer: false,
      aiConsent: false,
      autoApply: true,
      onboarded: false,
      timezone: "Asia/Jerusalem",
      quietStart: 22,
      quietEnd: 7,
    },
    tasks: [],
    facts: [],
    shopping: [],
    reminders: [],
    messages: [],
    excludedTemplates: [],
    planning: { today: null, plan: null },
    events: [],
    members: [],
    suggestionHistory: [],
    learning: [],
    compactedMemory: {
      facts: [],
      preferences: [],
      patterns: [],
      updatedAt: null,
      lifeAdminWindow: {
        preferredStartMinutes: null,
        preferredEndMinutes: null,
        confidence: 0,
        samples: 0,
      },
    },
    operations: [],
    homeAreas: [],
    firstScan: { status: "not_started", completedAt: null, session: null },
  };
}

export const TaskInput = TaskSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  actualWorkMinutes: true,
  occurrenceOf: true,
  status: true,
  startedAt: true,
})
  .partial()
  .extend({
    title: z.string().min(1).max(200),
    /** Optional stable id for scan approve / dependency wiring. */
    id: z.string().uuid().optional(),
  });

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("task.create"), task: TaskInput }),
  z.object({
    type: z.literal("task.update"),
    id: z.string().uuid(),
    patch: TaskSchema.pick({
      title: true,
      categoryId: true,
      detailTypeId: true,
      classification: true,
      enrichmentStatus: true,
      kind: true,
      dueAt: true,
      preferredWindow: true,
      workMinutes: true,
      waitMinutes: true,
      effort: true,
      priority: true,
      notes: true,
      steps: true,
      dependsOn: true,
      recurrenceDays: true,
      relatedMemberIds: true,
      homeAreaIds: true,
    }).partial(),
  }),
  z.object({
    type: z.literal("task.status"),
    id: z.string().uuid(),
    status: StatusSchema,
    actualWorkMinutes: z.number().int().min(1).max(1440).optional(),
  }),
  z.object({ type: z.literal("task.start"), id: z.string().uuid() }),
  z.object({ type: z.literal("task.defer"), id: z.string().uuid() }),
  z.object({
    type: z.literal("task.deferUntil"),
    id: z.string().uuid(),
    hiddenUntil: Stamp,
  }),
  z.object({
    type: z.literal("task.step"),
    id: z.string().uuid(),
    stepId: z.string().uuid(),
    done: z.boolean(),
  }),
  z.object({
    type: z.literal("shopping.add"),
    title: z.string().min(1).max(150),
    quantity: z.string().max(60).optional(),
  }),
  z.object({
    type: z.literal("shopping.check"),
    id: z.string().uuid(),
    checked: z.boolean(),
  }),
  z.object({ type: z.literal("shopping.remove"), id: z.string().uuid() }),
  z.object({
    type: z.literal("fact.add"),
    text: z.string().min(1).max(500),
    kind: z.enum(["stable", "temporary", "inference"]),
    expiresAt: Stamp.nullable(),
  }),
  z.object({
    type: z.literal("fact.update"),
    id: z.string().uuid(),
    patch: FactSchema.pick({
      text: true,
      kind: true,
      expiresAt: true,
    }).partial(),
  }),
  z.object({ type: z.literal("fact.remove"), id: z.string().uuid() }),
  z.object({
    type: z.literal("reminder.add"),
    title: z.string().min(1).max(200),
    dueAt: Stamp,
    taskId: z.string().uuid().nullable(),
    urgency: ReminderUrgencySchema.optional(),
  }),
  z.object({ type: z.literal("reminder.cancel"), id: z.string().uuid() }),
  z.object({
    type: z.literal("planning.set"),
    constraint: PlanningConstraintSchema,
  }),
  z.object({ type: z.literal("planning.clear") }),
  z.object({
    type: z.literal("plan.set"),
    plan: DailyPlanSessionSchema,
  }),
  z.object({ type: z.literal("plan.clear") }),
  z.object({
    type: z.literal("plan.itemUpdate"),
    taskId: z.string().uuid(),
    patch: DailyPlanItemSchema.partial(),
  }),
  z.object({
    type: z.literal("profile.update"),
    patch: ProfileSchema.partial(),
  }),
  z.object({ type: z.literal("template.exclude"), id: z.string() }),
  z.object({ type: z.literal("template.restore"), id: z.string() }),
  z.object({
    type: z.literal("message.add"),
    role: z.enum(["user", "assistant"]),
    text: z.string().max(12000),
    turnId: z.string().uuid().nullable().optional(),
  }),
  z.object({ type: z.literal("history.clear") }),
  z.object({
    type: z.literal("member.upsert"),
    member: HouseholdMemberSchema.partial({
      id: true,
      createdAt: true,
      updatedAt: true,
    }).extend({ name: z.string().min(1).max(80) }),
  }),
  z.object({ type: z.literal("member.remove"), id: z.string().uuid() }),
  z.object({
    type: z.literal("suggestion.record"),
    taskId: z.string().uuid(),
    outcome: z.enum(["suggested", "selected", "declined"]),
  }),
  z.object({
    type: z.literal("operation.record"),
    turnId: z.string().uuid(),
    summary: z.string().max(200),
    actionTypes: z.array(z.string()).max(40),
  }),
  z.object({
    type: z.literal("homeArea.upsert"),
    area: HomeAreaSchema.partial({
      id: true,
    }).extend({ name: z.string().min(1).max(80) }),
  }),
  z.object({ type: z.literal("homeArea.remove"), id: z.string().uuid() }),
  z.object({
    type: z.literal("scan.set"),
    firstScan: z.object({
      status: FirstScanStatusSchema,
      completedAt: Stamp.nullable().optional(),
      session: FirstScanSessionSchema.nullable().optional(),
    }),
  }),
  z.object({
    type: z.literal("memory.lifeAdmin"),
    response: z.enum(["yes", "earlier", "later", "varies"]),
    completedAtMinutes: z
      .number()
      .int()
      .min(0)
      .max(24 * 60),
  }),
]);
export type Action = z.infer<typeof ActionSchema>;
export const ActionBatch = z.array(ActionSchema).min(1).max(60);

export function normalize(s: string) {
  return s
    .normalize("NFKC")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

// Named entrypoints: import from ./common, ./task, etc. (re-export wrappers).
