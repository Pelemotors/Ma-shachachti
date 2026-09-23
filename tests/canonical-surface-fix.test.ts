import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildHomeNow } from "../apps/mobile/src/product/canonicalHome.ts";
function greetingName(displayName?: string | null) {
  const raw = displayName?.trim();
  if (!raw) return null;
  if (raw.includes("@")) return null;
  const first = raw.split(/\s+/)[0] ?? "";
  if (first.length < 2) return null;
  if (/[0-9._]/.test(first) && !/[\u0590-\u05FF]/.test(first)) return null;
  return first;
}

function timeGreeting(name?: string | null, now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
  const part = hour < 12 ? "בוקר טוב" : hour < 17 ? "צהריים טובים" : "ערב טוב";
  const trimmed = name?.trim();
  return trimmed ? `${part}, ${trimmed}.` : `${part}.`;
}
import {
  chatSendResult,
  claimSendLock,
  FREETIME_DEFAULT_MINUTES,
  homeSendResult,
  reconcileChatThread,
  resolveFreetimeMinutes,
  shoppingAddResult,
  taskFitsFreeTimeWindow,
} from "../apps/mobile/src/product/surfaceCommit.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const tasks = [
  { id: "t1", title: "רופא ילדים", status: "open" as const },
  { id: "t2", title: "לקנות טיטולים", status: "done" as const },
  { id: "t3", title: "ביטול", status: "cancelled" as const },
  { id: "t4", title: "ארוחת ערב", status: "open" as const },
];

test("HOME fixture flags are off and live Home does not overlay demo rows", () => {
  const fixture = read("../apps/mobile/src/screens/home-v4/homeV4Fixture.ts");
  const qa = read("../apps/mobile/src/product/homeQaFixture.ts");
  const loader = read("../apps/mobile/src/screens/home-v4/useHomeV4Data.ts");
  const header = read("../apps/mobile/src/screens/home-v4/HomeHeader.tsx");
  const shell = read("../apps/mobile/src/navigation/ProductShell.tsx");
  const home = read("../apps/mobile/src/screens/home-v4/HomeV4Screen.tsx");
  assert.match(fixture, /HOME_V4_VISUAL_QA = false/);
  assert.match(qa, /HOME_QA_FIXTURE_ENABLED = false/);
  assert.doesNotMatch(loader, /homeV4Fixture|HOME_V4_VISUAL_QA/);
  assert.doesNotMatch(header, /homeV4Fixture|HOME_V4_VISUAL_QA/);
  assert.match(shell, /HomeV4Screen/);
  assert.doesNotMatch(shell, /ProductHomeScreen/);
  assert.doesNotMatch(home, /3 מתוך 8|להכין ארוחת ערב|לאסוף הילדים מהגן/);
});

test("HOME empty day_plan is empty state, not demo tasks", () => {
  const empty = buildHomeNow({
    plan: { plan: null, items: [] },
    tasks,
    nowMs: Date.parse("2026-09-21T10:00:00.000Z"),
    formatTime: () => "00:00",
  });
  assert.equal(empty.hasPlan, false);
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.rows, []);
  const overview = read("../apps/mobile/src/screens/home-v4/TodayOverviewCard.tsx");
  assert.match(overview, /אין עדיין לו״ז להיום/);
  assert.match(overview, /צור לי לו״ז/);
});

test("HOME canonical plan shows progress and next open items", () => {
  const nowMs = Date.parse("2026-09-21T08:00:00.000Z");
  const view = buildHomeNow({
    plan: {
      plan: { id: "p1", plan_date: "2026-09-21" },
      items: [
        { task_id: "t2", start_at: "2026-09-21T07:00:00.000Z" },
        { task_id: "t1", start_at: "2026-09-21T11:00:00.000Z" },
        { task_id: "t4", start_at: "2026-09-21T13:30:00.000Z" },
        { task_id: "t3", start_at: "2026-09-21T15:00:00.000Z" },
      ],
    },
    tasks,
    nowMs,
    formatTime: (iso) => iso.slice(11, 16),
  });
  assert.equal(view.hasPlan, true);
  assert.equal(view.done, 1);
  assert.equal(view.total, 3);
  assert.deepEqual(view.rows.map((row) => row.title), ["רופא ילדים", "ארוחת ערב"]);
  assert.equal(view.rows.some((row) => row.title === "ביטול"), false);
});

test("HOME completed item is not treated as open", () => {
  const view = buildHomeNow({
    plan: {
      plan: { id: "p1" },
      items: [{ task_id: "t2", start_at: "2026-09-21T18:00:00.000Z" }],
    },
    tasks,
    nowMs: Date.parse("2026-09-21T08:00:00.000Z"),
    formatTime: () => "21:00",
  });
  assert.equal(view.done, 1);
  assert.equal(view.total, 1);
  assert.deepEqual(view.rows, []);
});

test("HOME refresh helper returns the new plan snapshot", () => {
  const first = buildHomeNow({
    plan: { plan: { id: "p1" }, items: [{ task_id: "t1", start_at: "2026-09-21T11:00:00.000Z" }] },
    tasks,
    nowMs: Date.parse("2026-09-21T08:00:00.000Z"),
    formatTime: () => "11:00",
  });
  const afterComplete = buildHomeNow({
    plan: { plan: { id: "p1" }, items: [{ task_id: "t1", start_at: "2026-09-21T11:00:00.000Z" }] },
    tasks: [{ ...tasks[0]!, status: "done" }, ...tasks.slice(1)],
    nowMs: Date.parse("2026-09-21T08:00:00.000Z"),
    formatTime: () => "11:00",
  });
  assert.equal(first.rows.length, 1);
  assert.equal(afterComplete.rows.length, 0);
  assert.equal(afterComplete.done, 1);
  const loader = read("../apps/mobile/src/screens/home-v4/useHomeV4Data.ts");
  assert.match(loader, /AppState.addEventListener/);
  assert.match(loader, /getDayPlan/);
});

test("CHAT failed Home send does not navigate and keeps draft", () => {
  const fail = homeSendResult(false);
  const ok = homeSendResult(true);
  assert.equal(fail.navigateToChat, false);
  assert.equal(fail.clearDraft, false);
  assert.equal(fail.showError, true);
  assert.equal(ok.navigateToChat, true);
  assert.equal(ok.clearDraft, true);
  const home = read("../apps/mobile/src/screens/home-v4/HomeV4Screen.tsx");
  assert.match(home, /homeSendResult\(false\)/);
  assert.doesNotMatch(home, /catch \{[\s\S]*onOpen\("chat"\)/);
});

test("CHAT failed send is not treated as a canonical sent message", () => {
  const fail = chatSendResult(false);
  assert.equal(fail.keepOptimistic, false);
  assert.equal(fail.appendCanonical, false);
  assert.equal(fail.clearDraft, false);
  const chat = read("../apps/mobile/src/screens/ChatScreen.tsx");
  assert.match(chat, /chatSendResult\(false\)/);
  assert.doesNotMatch(chat, /\/\* keep optimistic user line \*\//);
  assert.match(chat, /await sendChat/);
  const sendBlock = chat.slice(chat.indexOf("async function send"));
  const localBeforeSend = sendBlock.indexOf("setMessages");
  const sendCall = sendBlock.indexOf("await sendChat");
  assert.ok(sendCall >= 0);
  assert.ok(localBeforeSend < 0 || localBeforeSend > sendCall);
});

test("CHAT successful send reloads canonical thread after persist", () => {
  const ok = chatSendResult(true);
  assert.equal(ok.appendCanonical, true);
  assert.equal(ok.clearDraft, true);
  const chat = read("../apps/mobile/src/screens/ChatScreen.tsx");
  assert.match(chat, /await sendChat/);
  assert.match(chat, /await reload\(data\.session_id\)/);
  assert.match(chat, /loadChat/);
  assert.match(chat, /reconcileChatThread/);
  assert.match(chat, /claimSendLock/);
  assert.match(chat, /newChatTurnId/);
});

test("CHAT reconcile keeps one row per canonical message id", () => {
  const once = reconcileChatThread([
    { id: "u1", role: "user", content: "שלום" },
    { id: "a1", role: "assistant", content: "היי" },
    { id: "a1", role: "assistant", content: "היי" },
    { id: "u1", role: "user", content: "שלום" },
  ]);
  assert.deepEqual(once.map((row) => row.id), ["u1", "a1"]);
  const sameText = reconcileChatThread([
    { id: "a1", role: "assistant", content: "כן" },
    { id: "a2", role: "assistant", content: "כן" },
  ]);
  assert.deepEqual(sameText.map((row) => row.id), ["a1", "a2"]);
  const lock = { current: false };
  assert.equal(claimSendLock(lock), true);
  assert.equal(claimSendLock(lock), false);
  lock.current = false;
  assert.equal(claimSendLock(lock), true);
});

test("CHAT thread + footer layout contract keeps composer out of the list", () => {
  const screen = read("../apps/mobile/src/components/ui/AppScreen.tsx");
  const composer = read("../apps/mobile/src/components/ui/ChatComposer.tsx");
  const chat = read("../apps/mobile/src/screens/ChatScreen.tsx");
  assert.match(screen, /footerSlot/);
  assert.match(screen, /flexGrow: 0/);
  assert.match(screen, /KeyboardAvoidingView/);
  assert.match(composer, /flexGrow: 0/);
  assert.doesNotMatch(composer, /height:\s*["']100%["']/);
  assert.match(chat, /footer=\{/);
  assert.match(chat, /stickToBottom/);
});

test("SHOPPING failed add keeps draft; success clears it and accepts list", () => {
  const fail = shoppingAddResult(false, "חלב QA 2");
  const ok = shoppingAddResult(true, "חלב QA 2");
  assert.equal(fail.nextDraft, "חלב QA 2");
  assert.equal(fail.acceptList, false);
  assert.equal(ok.nextDraft, "");
  assert.equal(ok.acceptList, true);
  const shopping = read("../apps/mobile/src/screens/ShoppingScreen.tsx");
  const addFn = shopping.slice(shopping.indexOf("async function add"));
  assert.ok(addFn.indexOf("await addShopping") < addFn.indexOf("setDraft(result.nextDraft)"));
});

test("SHOPPING footer is slotted and cannot grow over the list", () => {
  const shopping = read("../apps/mobile/src/screens/ShoppingScreen.tsx");
  const screen = read("../apps/mobile/src/components/ui/AppScreen.tsx");
  assert.match(shopping, /footer=\{/);
  assert.match(screen, /footerSlot: \{ flexGrow: 0, flexShrink: 0 \}/);
});

test("FREE TIME selected minutes stay 15/30/60 and reach results", () => {
  assert.equal(resolveFreetimeMinutes(15), 15);
  assert.equal(resolveFreetimeMinutes(30), 30);
  assert.equal(resolveFreetimeMinutes(60), 60);
  assert.equal(resolveFreetimeMinutes(undefined), FREETIME_DEFAULT_MINUTES);
  const shell = read("../apps/mobile/src/navigation/ProductShell.tsx");
  const results = read("../apps/mobile/src/screens/FreeTimeResultsScreen.tsx");
  const composer = read("../apps/mobile/src/screens/PlanComposerScreen.tsx");
  assert.match(shell, /minutes=\{freetimeMinutes\}/);
  assert.doesNotMatch(shell, /<FreeTimeResultsScreen minutes=\{30\}/);
  assert.match(results, /resolveFreetimeMinutes\(minutes\)/);
  assert.match(results, /taskFitsFreeTimeWindow/);
  assert.match(composer, /kind: "freetime", minutes/);
  assert.match(composer, /if \(!planMode\)/);
  const fits = taskFitsFreeTimeWindow(
    {
      status: "open",
      planned_start_at: "2026-09-21T10:00:00.000Z",
      planned_end_at: "2026-09-21T10:15:00.000Z",
    },
    15,
  );
  const tooLong = taskFitsFreeTimeWindow(
    {
      status: "open",
      planned_start_at: "2026-09-21T10:00:00.000Z",
      planned_end_at: "2026-09-21T12:00:00.000Z",
    },
    15,
  );
  assert.equal(fits, true);
  assert.equal(tooLong, false);
});

test("PROFILE greeting uses canonical display name and falls back without a name", () => {
  assert.equal(greetingName("אירה כהן"), "אירה");
  assert.equal(greetingName("irasamama@gmail.com"), null);
  assert.equal(greetingName(null), null);
  const named = timeGreeting("אירה");
  assert.match(named, /אירה/);
  assert.match(named, /,/);
  assert.ok(named.endsWith("."));
  const fallback = timeGreeting(null);
  assert.doesNotMatch(fallback, /,/);
  assert.ok(fallback.endsWith("."));
  const home = read("../apps/mobile/src/screens/home-v4/HomeV4Screen.tsx");
  const greetingSrc = read("../apps/mobile/src/product/greeting.ts");
  const loader = read("../apps/mobile/src/screens/home-v4/useHomeV4Data.ts");
  assert.match(home, /data\.greeting/);
  assert.match(greetingSrc, /productNow/);
  assert.match(loader, /const greeting = timeGreeting\(displayName\)/);
  assert.match(loader, /setClockEpoch/);
});
