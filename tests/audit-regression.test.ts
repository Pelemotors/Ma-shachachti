import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentOutput, parseAgentDecisionIsolated } from "../lib/agent/schema";
import { Action, StateSchema, emptyState } from "../lib/model";
import { applyActions, planDay } from "../lib/engine";
import { dayKey } from "../lib/time";

const now = new Date("2026-09-06T10:00:00Z");
const plus = (minutes: number) =>
  new Date(now.getTime() + minutes * 60000).toISOString();
const create = (title: string, extra = {}) =>
  ({ type: "task.create", task: { title, ...extra } }) as Action;

test("legacy states receive an empty planning model without data loss", () => {
  const legacy = emptyState() as any;
  delete legacy.planning;
  legacy.tasks.push(
    applyActions(emptyState(), [create("כביסה")], now).tasks[0],
  );
  const parsed = StateSchema.parse(legacy);
  assert.deepEqual(parsed.planning, { today: null, plans: {} });
  assert.equal(parsed.tasks[0].title, "כביסה");
});

test("daily plan honors available start/end and blocked appointment windows", () => {
  let s = applyActions(
    emptyState(),
    [
      create("א", { workMinutes: 20, effort: 1 }),
      create("ב", { workMinutes: 20, effort: 1 }),
      create("ג", { workMinutes: 20, effort: 1 }),
    ],
    now,
  );
  s = applyActions(
    s,
    [
      {
        type: "planning.set",
        constraint: {
          date: dayKey(now, s.profile.timezone),
          availableFrom: plus(60),
          availableUntil: plus(180),
          unavailable: [{ start: plus(90), end: plus(120) }],
          effort: 2,
          note: "תור באמצע החלון",
        },
      },
    ],
    now,
  );
  const plan = planDay(s, 240, 3, now);
  assert.ok(plan.selected.length > 0);
  assert.ok(plan.selected.every((x) => x.start >= 60 && x.end <= 180));
  assert.ok(
    plan.selected.every(
      (x) => !(x.start < 120 && x.start + x.task.workMinutes > 90),
    ),
  );
});

test("daily energy constraint caps tasks even if UI asks for more effort", () => {
  let s = applyActions(
    emptyState(),
    [
      create("קל", { workMinutes: 10, effort: 1 }),
      create("כבד", { workMinutes: 10, effort: 3 }),
    ],
    now,
  );
  s = applyActions(
    s,
    [
      {
        type: "planning.set",
        constraint: {
          date: dayKey(now, s.profile.timezone),
          availableFrom: null,
          availableUntil: plus(120),
          unavailable: [],
          effort: 1,
          note: "מעט כוח",
        },
      },
    ],
    now,
  );
  const titles = planDay(s, 120, 3, now).selected.map((x) => x.task.title);
  assert.deepEqual(titles, ["קל"]);
});

test("planning constraint from another local day does not affect today", () => {
  let s = applyActions(emptyState(), [create("כבד", { effort: 3 })], now);
  s = applyActions(
    s,
    [
      {
        type: "planning.set",
        constraint: {
          date: "2026-09-07",
          availableFrom: null,
          availableUntil: null,
          unavailable: [],
          effort: 1,
          note: "מחר",
        },
      },
    ],
    now,
  );
  assert.equal(planDay(s, 120, 3, now).selected.length, 1);
});

test("planning clear returns the day to normal", () => {
  let s = emptyState();
  s = applyActions(
    s,
    [
      {
        type: "planning.set",
        constraint: {
          date: dayKey(now, s.profile.timezone),
          availableFrom: plus(60),
          availableUntil: plus(120),
          unavailable: [],
          effort: 1,
          note: "שונה",
        },
      },
    ],
    now,
  );
  s = applyActions(s, [{ type: "planning.clear" }], now);
  assert.equal(s.planning.today, null);
});

test("memory can be corrected without creating a duplicate or losing provenance", () => {
  let s = applyActions(
    emptyState(),
    [
      {
        type: "fact.add",
        text: "החוג ביום שני",
        kind: "stable",
        expiresAt: null,
      },
    ],
    now,
  );
  const id = s.facts[0].id;
  const source = s.facts[0].source;
  s = applyActions(
    s,
    [{ type: "fact.update", id, patch: { text: "החוג ביום שלישי" } }],
    now,
  );
  assert.equal(s.facts.length, 1);
  assert.equal(s.facts[0].text, "החוג ביום שלישי");
  assert.equal(s.facts[0].source, source);
});

test("memory update cannot turn temporary information into non-expiring certainty", () => {
  let s = applyActions(
    emptyState(),
    [
      {
        type: "fact.add",
        text: "הילדה ישנה",
        kind: "temporary",
        expiresAt: plus(30),
      },
    ],
    now,
  );
  assert.throws(() =>
    applyActions(
      s,
      [
        {
          type: "fact.update",
          id: s.facts[0].id,
          patch: { expiresAt: null },
        },
      ],
      now,
    ),
  );
});

test("agent contract allows explicit planning and memory correction", () => {
  const id = crypto.randomUUID();
  const output = AgentOutput.parse({
    reply: "התאמתי את ההצעה ליום שתיארת.",
    explicitActions: [
      {
        type: "planning.set",
        constraint: {
          date: "2026-09-06",
          availableFrom: plus(30),
          availableUntil: plus(180),
          unavailable: [],
          effort: 2,
          note: "חלון קצר",
        },
      },
      { type: "fact.update", id, patch: { text: "פרט מתוקן" } },
    ],
    clarification: null,
    proposal: null,
    affectsToday: true,
  });
  assert.equal(output.explicitActions.length, 2);
});

test("agent contract still blocks profile and permission changes", () => {
  const protectedOnly = parseAgentDecisionIsolated({
    reply: "אין שינוי.",
    explicitActions: [{ type: "profile.update", patch: { aiConsent: true } }],
    clarification: null,
    proposal: null,
    affectsToday: false,
  });
  assert.equal(protectedOnly.decision.explicitActions.length, 0);
  assert.ok(protectedOnly.rejectedActions.length >= 1);
});

test("completed work with a former wait period never re-enters the plan", () => {
  let s = applyActions(
    emptyState(),
    [create("מכונה", { workMinutes: 5, waitMinutes: 60 })],
    now,
  );
  s = applyActions(
    s,
    [{ type: "task.status", id: s.tasks[0].id, status: "done" }],
    now,
  );
  assert.equal(planDay(s, 120, 3, now).selected.length, 0);
});

test("unknown status remains explicit and is never silently completed", () => {
  let s = applyActions(emptyState(), [create("מדיח")], now);
  s = applyActions(
    s,
    [{ type: "task.status", id: s.tasks[0].id, status: "unknown" }],
    now,
  );
  assert.equal(s.tasks[0].status, "unknown");
  assert.equal(s.tasks[0].completedAt, null);
});

const decision = (
  reply: string,
  explicitActions: unknown[] = [],
  opts: { clarify?: boolean; affectsToday?: boolean } = {},
) => ({
  reply,
  explicitActions,
  clarification: opts.clarify
    ? { question: reply, unresolvedPart: null }
    : null,
  proposal: null,
  affectsToday: opts.affectsToday ?? false,
});

const contractCases: Array<{ phrase: string; output: unknown }> = [
  {
    phrase: "צריך לקפל כביסה",
    output: decision("אפשר להוסיף.", [
      { type: "task.create", task: { title: "לקפל כביסה", kind: "task" } },
    ]),
  },
  {
    phrase: "אולי להכין פשטידה",
    output: decision("כרעיון.", [
      { type: "task.create", task: { title: "להכין פשטידה", kind: "idea" } },
    ]),
  },
  {
    phrase: "לקנות חלב",
    output: decision("לקניות.", [{ type: "shopping.add", title: "חלב" }]),
  },
  {
    phrase: "תזכיר לי בעוד שעה",
    output: decision("תזכורת.", [
      { type: "reminder.add", title: "תזכורת", dueAt: plus(60), taskId: null },
    ]),
  },
  {
    phrase: "אני לבד היום",
    output: decision("מידע זמני.", [
      {
        type: "fact.add",
        text: "לבד היום",
        kind: "temporary",
        expiresAt: plus(600),
      },
    ]),
  },
  {
    phrase: "זה לא נכון יותר",
    output: decision("צריך לזהות איזה פרט.", [], { clarify: true }),
  },
  {
    phrase: "סיימתי",
    output: decision("צריך לזהות מה.", [], { clarify: true }),
  },
  {
    phrase: "עזוב את זה היום",
    output: decision("צריך לזהות את המשימה.", [], { clarify: true }),
  },
  { phrase: "אין לי כוח", output: decision("נבחר משהו קל.") },
  { phrase: "כל הבית בלגן", output: decision("נתחיל מדבר אחד.") },
  {
    phrase: "מחר יש תור",
    output: decision("צריך שעה כדי לחסום חלון.", [], { clarify: true }),
  },
  {
    phrase: "היום פנויה מ-14 עד 16",
    output: decision(
      "חלון להיום.",
      [
        {
          type: "planning.set",
          constraint: {
            date: "2026-09-06",
            availableFrom: plus(60),
            availableUntil: plus(180),
            unavailable: [],
            effort: null,
            note: "פנויה בחלון מוגדר",
          },
        },
      ],
      { affectsToday: true },
    ),
  },
  {
    phrase: "היום חזר כרגיל",
    output: decision("חזרה לשגרה.", [{ type: "planning.clear" }], {
      affectsToday: true,
    }),
  },
  {
    phrase: "מחק הכל",
    output: decision("לא מבצע מחיקה רחבה דרך הסוכן.", [], { clarify: true }),
  },
  {
    phrase: "תשנה לי הרשאות",
    output: decision("אין לי הרשאה לזה.", [], { clarify: true }),
  },
  { phrase: "לא יודעת אם עשיתי כביסה", output: decision("לא אניח שבוצע.") },
  {
    phrase: "יש לי 20 דקות",
    output: decision("אפשר לבחור מתוך המשימות הקיימות."),
  },
  {
    phrase: "תקן שהחוג בשלישי",
    output: decision("צריך מזהה של הזיכרון.", [], { clarify: true }),
  },
  {
    phrase: "הילדה ישנה עכשיו",
    output: decision("מידע זמני קצר.", [
      {
        type: "fact.add",
        text: "הילדה ישנה",
        kind: "temporary",
        expiresAt: plus(60),
      },
    ]),
  },
  {
    phrase: "תעשה לי קניות ותזכורת",
    output: decision("אפשר להציע את שתי הפעולות.", [
      { type: "shopping.add", title: "פריט" },
      { type: "reminder.add", title: "תזכורת", dueAt: plus(60), taskId: null },
    ]),
  },
];

test("20 representative Hebrew intents all fit the single agent output contract", () => {
  assert.equal(contractCases.length, 20);
  for (const item of contractCases) {
    assert.doesNotThrow(() => AgentOutput.parse(item.output), item.phrase);
  }
});
