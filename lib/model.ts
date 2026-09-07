import { z } from "zod";
export const categories = [
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
export const CategorySchema = z.enum(categories);
export const StatusSchema = z.enum(["open", "done", "cancelled", "unknown"]);
const Stamp = z.string().datetime({ offset: true });
const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const TaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  category: CategorySchema,
  kind: z.enum(["task", "idea"]),
  status: StatusSchema,
  createdAt: Stamp,
  updatedAt: Stamp,
  dueAt: Stamp.nullable(),
  hiddenUntil: Stamp.nullable(),
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
  .refine((x) => Date.parse(x.end) > Date.parse(x.start), "Invalid busy window");
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

export const MessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  text: z.string().max(12000),
  createdAt: Stamp,
});

export const StateSchema = z.object({
  schemaVersion: z.literal(1),
  profile: ProfileSchema,
  tasks: z.array(TaskSchema).max(2000),
  facts: z.array(FactSchema).max(300),
  shopping: z.array(ShoppingSchema).max(1000),
  reminders: z.array(ReminderSchema).max(500),
  messages: z.array(MessageSchema).max(200),
  excludedTemplates: z.array(z.string()).max(500),
  planning: z
    .object({ today: PlanningConstraintSchema.nullable() })
    .default({ today: null }),
  events: z
    .array(
      z.object({
        id: z.string().uuid(),
        at: Stamp,
        type: z.string(),
        summary: z.string(),
      }),
    )
    .max(500),
});
export type AppState = z.infer<typeof StateSchema>;
export type Profile = z.infer<typeof ProfileSchema>;

export function emptyState(): AppState {
  return {
    schemaVersion: 1,
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
    planning: { today: null },
    events: [],
  };
}

const TaskInput = TaskSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  actualWorkMinutes: true,
  occurrenceOf: true,
  status: true,
})
  .partial()
  .extend({ title: z.string().min(1).max(200) });

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("task.create"), task: TaskInput }),
  z.object({
    type: z.literal("task.update"),
    id: z.string().uuid(),
    patch: TaskSchema.pick({
      title: true,
      category: true,
      kind: true,
      dueAt: true,
      workMinutes: true,
      waitMinutes: true,
      effort: true,
      priority: true,
      notes: true,
      steps: true,
      dependsOn: true,
      recurrenceDays: true,
    }).partial(),
  }),
  z.object({
    type: z.literal("task.status"),
    id: z.string().uuid(),
    status: StatusSchema,
    actualWorkMinutes: z.number().int().min(1).max(1440).optional(),
  }),
  z.object({ type: z.literal("task.defer"), id: z.string().uuid() }),
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
    patch: FactSchema.pick({ text: true, kind: true, expiresAt: true }).partial(),
  }),
  z.object({ type: z.literal("fact.remove"), id: z.string().uuid() }),
  z.object({
    type: z.literal("reminder.add"),
    title: z.string().min(1).max(200),
    dueAt: Stamp,
    taskId: z.string().uuid().nullable(),
  }),
  z.object({ type: z.literal("reminder.cancel"), id: z.string().uuid() }),
  z.object({
    type: z.literal("planning.set"),
    constraint: PlanningConstraintSchema,
  }),
  z.object({ type: z.literal("planning.clear") }),
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
  }),
  z.object({ type: z.literal("history.clear") }),
]);
export type Action = z.infer<typeof ActionSchema>;
export const ActionBatch = z.array(ActionSchema).min(1).max(30);

export function normalize(s: string) {
  return s
    .normalize("NFKC")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}
