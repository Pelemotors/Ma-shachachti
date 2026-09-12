import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  canSelfApprove,
  isAdminAccess,
  isApprovedAccount,
  isSelfLockout,
  pendingAccountMessage,
  signupCreatedMessage,
} from "../lib/account-access.ts";
import { parseChatRequest } from "../lib/chat-request.ts";
import { inspectActions, composeReply } from "../lib/action-schema.ts";
import { ACTION_TYPES } from "../lib/types.ts";
import { clearUserTasks } from "../lib/actions.ts";
import {
  DEFAULT_REMINDER_MINUTES,
  isReminderMinuteOption,
  reminderLabel,
  effectiveReminderOffset,
} from "../lib/reminders.ts";
import { planTaskReminder } from "../lib/reminder-plan.ts";
import { reminderPatchFromSelect } from "../lib/push-client.ts";
import { AGENT_INSTRUCTIONS } from "../lib/agent/instructions.ts";

test("pending users are not treated as approved and cannot self-approve", () => {
  assert.equal(isApprovedAccount({ role: "user", approved: false }), false);
  assert.equal(isApprovedAccount({ role: "user", approved: true }), true);
  assert.equal(canSelfApprove(), false);
  assert.equal(pendingAccountMessage().includes("ממתין"), true);
  assert.equal(signupCreatedMessage().includes("נוצר"), true);
});

test("only an approved admin has control-room access", () => {
  assert.equal(isAdminAccess({ role: "admin", approved: true }), true);
  assert.equal(isAdminAccess({ role: "admin", approved: false }), false);
  assert.equal(isAdminAccess({ role: "user", approved: true }), false);
});

test("admin cannot self-lock", () => {
  assert.equal(isSelfLockout("a", "a", { approved: false }), true);
  assert.equal(isSelfLockout("a", "a", { role: "user" }), true);
  assert.equal(isSelfLockout("a", "b", { approved: false }), false);
});

test("login page has signup and forgot password but no confirm-password field", () => {
  const page = readFileSync(
    new URL("../app/login/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /signUp/);
  assert.match(page, /resetPasswordForEmail/);
  assert.match(page, /אין לי חשבון — הרשמה/);
  assert.match(page, /שכחתי סיסמה/);
  assert.doesNotMatch(page, /אימות סיסמה/);
  assert.doesNotMatch(page, /confirmPassword/);
});

test("chat request can carry a session_id owned later by the server", () => {
  const parsed = parseChatRequest({
    message: "שלום",
    session_id: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(
      parsed.request.session_id,
      "11111111-1111-4111-8111-111111111111",
    );
  }
  const bad = parseChatRequest({ message: "שלום", session_id: "not-a-uuid" });
  assert.equal(bad.ok, false);
});

test("agent contract does not include task.delete_all", () => {
  assert.equal(
    (ACTION_TYPES as readonly string[]).includes("task.delete_all"),
    false,
  );
});

test("silent memory success is hidden but failure is shown", () => {
  const hidden = composeReply("מעולה.", [
    { ok: true, type: "memory.upsert", silent: true },
  ]);
  assert.equal(hidden.includes("שמרתי את זה לזיכרון"), false);
  const shown = composeReply("מעולה.", [
    { ok: true, type: "memory.upsert", silent: false },
  ]);
  assert.match(shown, /שמרתי את זה לזיכרון האישי/);
  const failed = composeReply("מעולה.", [
    { ok: false, type: "memory.upsert", error: "לא הצלחנו לשמור את הזיכרון." },
  ]);
  assert.match(failed, /לא הצלחנו לשמור את הזיכרון/);
});

test("explicit remember is not silent in the contract", () => {
  const inspected = inspectActions([
    {
      type: "memory.upsert",
      content: "מעדיף תשובות קצרות",
      kind: "preference",
      confidence: "high",
      silent: false,
    },
  ]);
  assert.equal(inspected.accepted[0]?.silent, false);
});

test("proactive memory can be silent=true", () => {
  const inspected = inspectActions([
    {
      type: "memory.upsert",
      content: "למשתמש יש בן בשם פלא",
      kind: "fact",
      confidence: "high",
      silent: true,
    },
  ]);
  assert.equal(inspected.accepted[0]?.silent, true);
});

test("offset 0 is at-task-time and does not inherit the default", () => {
  assert.equal(isReminderMinuteOption(0), true);
  assert.equal(reminderLabel(0), "בזמן המשימה");
  assert.equal(
    effectiveReminderOffset({
      due_at: "2026-09-10T18:00:00.000Z",
      reminder_enabled: true,
      reminder_offset_minutes: 0,
      default_reminder_minutes: 30,
    }),
    0,
  );
  assert.equal(
    effectiveReminderOffset({
      due_at: "2026-09-10T18:00:00.000Z",
      reminder_enabled: true,
      reminder_offset_minutes: null,
      default_reminder_minutes: 0,
    }),
    0,
  );
  const plan = planTaskReminder(
    {
      id: "t",
      user_id: "u",
      title: "דוד",
      status: "open",
      due_at: "2026-09-10T18:00:00.000Z",
      reminder_enabled: true,
      reminder_offset_minutes: 0,
      reminder_sent_at: null,
      reminder_claimed_at: null,
    },
    30,
    new Date("2026-09-10T18:00:00.000Z"),
  );
  assert.equal(plan.kind, "send");
  if (plan.kind === "send") {
    assert.equal(plan.offset, 0);
    assert.equal(plan.remindAt, "2026-09-10T18:00:00.000Z");
  }
  assert.notEqual(reminderPatchFromSelect("off").reminder_enabled, true);
  assert.equal(DEFAULT_REMINDER_MINUTES, 30);
});

test("reminder select 0 is at-task-time and off stays disabled", () => {
  assert.deepEqual(reminderPatchFromSelect("0"), {
    reminder_patch: "set",
    reminder_enabled: true,
    reminder_offset_minutes: 0,
  });
  assert.deepEqual(reminderPatchFromSelect("off"), {
    reminder_patch: "set",
    reminder_enabled: false,
    reminder_offset_minutes: null,
  });
});

test("admin lean APIs do not read app_states", () => {
  const files = [
    "app/api/admin/users/route.ts",
    "app/api/admin/overview/route.ts",
    "app/api/admin/activity/route.ts",
    "app/api/admin/ai/route.ts",
    "app/api/admin/tasks/route.ts",
    "app/api/admin/health/route.ts",
    "app/api/admin/incidents/route.ts",
  ];
  for (const file of files) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /app_states/);
    assert.doesNotMatch(source, /reminder_queue/);
  }
});

test("agent instructions mention proactive memory and opt-in reminders", () => {
  assert.match(AGENT_INSTRUCTIONS, /silent=true/);
  assert.match(AGENT_INSTRUCTIONS, /Reminder מופעל רק כאשר ברור/);
});

test("clearUserTasks only cancels the current user's open and done tasks", async () => {
  const rows = [
    { id: "1", user_id: "a", status: "open" },
    { id: "2", user_id: "a", status: "done" },
    { id: "3", user_id: "a", status: "cancelled" },
    { id: "4", user_id: "b", status: "open" },
  ];
  const db = {
    from() {
      const filters: Record<string, unknown> = {};
      let pending: Record<string, unknown> | null = null;
      const api: Record<string, unknown> = {
        update(next: Record<string, unknown>) {
          pending = next;
          return api;
        },
        select() {
          return api;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return api;
        },
        in(column: string, values: unknown[]) {
          filters[`in:${column}`] = values;
          return api;
        },
        neq(column: string, value: unknown) {
          filters[`neq:${column}`] = value;
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        then(
          resolve: (value: { data: unknown; error: null }) => unknown,
          reject: (reason: unknown) => unknown,
        ) {
          if (pending) {
            for (const row of rows) {
              const userOk =
                !filters.user_id || row.user_id === filters.user_id;
              const statusOk = Array.isArray(filters["in:status"])
                ? (filters["in:status"] as string[]).includes(row.status)
                : true;
              if (userOk && statusOk) Object.assign(row, pending);
            }
            return Promise.resolve({ data: null, error: null }).then(
              resolve,
              reject,
            );
          }
          const visible = rows.filter((row) => {
            if (filters.user_id && row.user_id !== filters.user_id)
              return false;
            if (filters["neq:status"] && row.status === filters["neq:status"]) {
              return false;
            }
            return true;
          });
          return Promise.resolve({ data: visible, error: null }).then(
            resolve,
            reject,
          );
        },
      };
      return api;
    },
  };
  const tasks = await clearUserTasks(db as never, "a");
  assert.equal(rows[0]?.status, "cancelled");
  assert.equal(rows[1]?.status, "cancelled");
  assert.equal(rows[2]?.status, "cancelled");
  assert.equal(rows[3]?.status, "open");
  assert.equal(
    tasks.every((task) => task.status !== "cancelled"),
    true,
  );
});
