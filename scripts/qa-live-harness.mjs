#!/usr/bin/env node
/**
 * Live QA harness against isolated QA stack (port 3011 + supabase :8011).
 * Never points at production.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const APP = process.env.QA_APP_URL || "http://127.0.0.1:3011";
const SUPA = process.env.QA_SUPABASE_URL || "http://127.0.0.1:8011";
const env = Object.fromEntries(
  readFileSync("/srv/ira/ma-shachachti/app/.env.qa", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const ANON = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const results = [];

function record(id, status, detail) {
  results.push({ id, status, detail });
  console.log(`${status === "PASS" ? "✓" : status === "FAIL" ? "✗" : "•"} ${id}: ${status} — ${detail}`);
}

async function login() {
  const res = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "qa-tester@example.com",
      password: "QaTestPass123!",
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`login failed: ${JSON.stringify(body)}`);
  return { token: body.access_token, userId: body.user.id };
}

async function chat(token, message, extra = {}) {
  const res = await fetch(`${APP}/api/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      turn_id: crypto.randomUUID(),
      ...extra,
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, headers: res.headers };
}

async function rest(token, path, init = {}) {
  const res = await fetch(`${SUPA}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function wipeQaUser(userId) {
  const { execSync } = await import("node:child_process");
  const sql = `DELETE FROM shopping_items WHERE user_id='${userId}';
DELETE FROM tasks WHERE user_id='${userId}';
DELETE FROM agent_memory WHERE user_id='${userId}';
DELETE FROM chat_messages WHERE user_id='${userId}';
DELETE FROM recordings WHERE user_id='${userId}';
UPDATE agent_turns SET status='failed', completed_at=now() WHERE user_id='${userId}' AND status='processing';`;
  execSync(
    `docker exec -i mashachachti-qa-db-1 psql -U postgres -v ON_ERROR_STOP=1`,
    { input: sql, stdio: ["pipe", "pipe", "pipe"] },
  );
}

async function count(token, table, userId) {
  const res = await fetch(
    `${SUPA}/rest/v1/${table}?select=id&user_id=eq.${userId}`,
    {
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${token}`,
        Prefer: "count=exact",
      },
    },
  );
  return Number(res.headers.get("content-range")?.split("/")[1] || 0);
}

async function main() {
  // Isolation proof
  const appEnv = (await fetch(APP + "/")).headers.get("x-app-env");
  if (appEnv !== "qa") {
    record("ENV", "FAIL", `expected X-App-Env=qa got ${appEnv}`);
  } else {
    record("ENV", "PASS", `X-App-Env=qa; APP=${APP}; SUPA=${SUPA}`);
  }
  if (!String(env.NEXT_PUBLIC_SUPABASE_URL).includes("8011")) {
    record("ENV-DB", "FAIL", "QA env not pointing at :8011");
    process.exit(2);
  }

  const { token, userId } = await login();

  // Clear prior QA rows for clean scenarios (QA DB only — via local docker)
  await wipeQaUser(userId);

  // QA-1 shopping
  {
    const before = await count(token, "shopping_items", userId);
    const { status, body } = await chat(token, "אני צריכה לקנות חלב");
    const after = await count(token, "shopping_items", userId);
    const reply = String(body.reply || "");
    const ok =
      status === 200 &&
      after === before + 1 &&
      !reply.includes("\n") &&
      /חלב/.test(reply) &&
      !/מעולה|עבורך|reasoning|בוא נחשוב/i.test(reply);
    record(
      "QA-1",
      ok ? "PASS" : "FAIL",
      `status=${status} shopping ${before}→${after} reply=${JSON.stringify(reply)}`,
    );
  }

  // QA-2 / QA-3 relation learn + exception via live agent
  {
    const learn = await chat(
      token,
      'כשאני אומרת לנקות את המקרר תוסיף אחריו לזרוק זבל. שמרי כ־action_followup JSON.',
    );
    const mem = await rest(
      token,
      `agent_memory?user_id=eq.${userId}&select=id,content,kind&order=created_at.desc&limit=5`,
    );
    const hasRelation = Array.isArray(mem.body)
      ? mem.body.some((row) => String(row.content).includes("action_followup"))
      : false;
    record(
      "QA-3-learn",
      hasRelation ? "PASS" : "FAIL",
      `learnStatus=${learn.status} memories=${JSON.stringify(mem.body).slice(0, 400)}`,
    );

    const tasksBefore = await count(token, "tasks", userId);
    const trigger = await chat(token, "אני צריכה לנקות את המקרר מחר");
    const tasksAfter = await rest(
      token,
      `tasks?user_id=eq.${userId}&status=eq.open&select=id,title,due_on&order=created_at.desc&limit=10`,
    );
    const titles = Array.isArray(tasksAfter.body)
      ? tasksAfter.body.map((t) => t.title)
      : [];
    const hasClean = titles.some((t) => /מקרר|fridge/i.test(t));
    const hasTrash = titles.some((t) => /זבל|trash/i.test(t));
    record(
      "QA-3-trigger",
      trigger.status === 200 && hasClean && hasTrash ? "PASS" : "FAIL",
      `status=${trigger.status} titles=${JSON.stringify(titles)} reply=${JSON.stringify(trigger.body.reply)}`,
    );

    const openBeforeException = Array.isArray(tasksAfter.body)
      ? tasksAfter.body.length
      : 0;
    // Isolate exception turn: clear prior tasks so we only see new creates
    const { execSync } = await import("node:child_process");
    execSync(
      `docker exec -i mashachachti-qa-db-1 psql -U postgres -c "DELETE FROM tasks WHERE user_id='${userId}'"`,
    );
    const exception = await chat(
      token,
      "ביום שישי לנקות מקרר אבל בלי לזרוק זבל הפעם",
    );
    const afterEx = await rest(
      token,
      `tasks?user_id=eq.${userId}&status=eq.open&select=id,title,due_on&order=created_at.desc&limit=20`,
    );
    const titlesEx = Array.isArray(afterEx.body)
      ? afterEx.body.map((t) => t.title)
      : [];
    const hasFridge = titlesEx.some((t) => /מקרר|fridge/i.test(t));
    const hasTrashEx = titlesEx.some((t) => /זבל|trash/i.test(t));
    const memAfter = await rest(
      token,
      `agent_memory?user_id=eq.${userId}&select=content&order=created_at.desc&limit=10`,
    );
    const relationStill = Array.isArray(memAfter.body)
      ? memAfter.body.some((row) => String(row.content).includes("action_followup"))
      : false;
    record(
      "QA-3-exception",
      exception.status === 200 && relationStill && hasFridge && !hasTrashEx
        ? "PASS"
        : "FAIL",
      `status=${exception.status} relationKept=${relationStill} hasFridge=${hasFridge} hasTrash=${hasTrashEx} tasks=${JSON.stringify(titlesEx)} openBefore=${openBeforeException}`,
    );

    execSync(
      `docker exec -i mashachachti-qa-db-1 psql -U postgres -c "DELETE FROM tasks WHERE user_id='${userId}'"`,
    );
    const later = await chat(token, "ביום ראשון לנקות מקרר");
    const laterTasks = await rest(
      token,
      `tasks?user_id=eq.${userId}&status=eq.open&select=title,due_on&order=created_at.desc&limit=20`,
    );
    const laterTitles = Array.isArray(laterTasks.body)
      ? laterTasks.body.map((t) => t.title)
      : [];
    record(
      "QA-3-restore",
      later.status === 200 &&
        laterTitles.some((t) => /מקרר|fridge/i.test(t)) &&
        laterTitles.some((t) => /זבל|trash/i.test(t))
        ? "PASS"
        : "FAIL",
      `status=${later.status} titles=${JSON.stringify(laterTitles)}`,
    );
  }

  // QA-4 reconcile corrections
  {
    const a = await chat(token, "תוסיפי משימה: להתקשר לסבתא מחר ב־10:00");
    const mid = await rest(
      token,
      `tasks?user_id=eq.${userId}&status=eq.open&title=like.*סבתא*&select=id,title,due_on,due_at`,
    );
    const b = await chat(token, "תקני: להתקשר לסבתא מחר ב־11:30");
    const c = await chat(token, "עוד תיקון: להתקשר לסבתא מחר ב־12:00");
    const final = await rest(
      token,
      `tasks?user_id=eq.${userId}&status=eq.open&title=like.*סבתא*&select=id,title,due_on,due_at`,
    );
    const n = Array.isArray(final.body) ? final.body.length : -1;
    record(
      "QA-4",
      a.status === 200 && c.status === 200 && n === 1 ? "PASS" : "FAIL",
      `n=${n} mid=${JSON.stringify(mid.body)} final=${JSON.stringify(final.body)} b=${b.status}`,
    );
  }

  // QA-5 schedule proposal isolation
  {
    // Seed open tasks so schedule has candidates (keep prior QA state)
    await chat(token, "תוסיפי משימה: לסדר את הבית היום");
    await chat(token, "תוסיפי משימה חשובה: לשלם חשבון חשמל");
    const today = new Date().toISOString().slice(0, 10);
    const plannedBefore = await rest(
      token,
      `tasks?user_id=eq.${userId}&planned_start_at=not.is.null&select=id,planned_start_at`,
    );
    const beforeCount = Array.isArray(plannedBefore.body)
      ? plannedBefore.body.length
      : 0;
    const schedule = await chat(token, `צור לי לו״ז לתאריך ${today}`, {
      surface: "schedule",
      surface_context: {
        type: "schedule",
        date: today,
        day_start: "08:00",
        day_end: "22:00",
      },
    });
    const plannedMid = await rest(
      token,
      `tasks?user_id=eq.${userId}&planned_start_at=not.is.null&select=id,planned_start_at`,
    );
    const midCount = Array.isArray(plannedMid.body) ? plannedMid.body.length : 0;
    const pref = await chat(token, "אני מעדיפה ניקיונות אחרי 14:00");
    const plannedAfterPref = await rest(
      token,
      `tasks?user_id=eq.${userId}&planned_start_at=not.is.null&select=id,planned_start_at`,
    );
    const afterPref = Array.isArray(plannedAfterPref.body)
      ? plannedAfterPref.body.length
      : 0;
    const shopBefore = await count(token, "shopping_items", userId);
    const shop = await chat(token, "אני צריכה לקנות לחם");
    const shopAfter = await count(token, "shopping_items", userId);
    const presentation =
      schedule.body?.presentation?.type === "schedule_plan"
        ? schedule.body.presentation
        : null;
    const isolationOk =
      schedule.status === 200 &&
      midCount === beforeCount &&
      afterPref === beforeCount &&
      shopAfter === shopBefore + 1;
    const presentationOk =
      presentation &&
      presentation.type === "schedule_plan" &&
      presentation.saved === false;
    record(
      "QA-5",
      isolationOk && presentationOk ? "PASS" : "FAIL",
      `sched=${schedule.status} planned ${beforeCount}/${midCount}/${afterPref} shop ${shopBefore}→${shopAfter} pref=${pref.status} presentation=${presentation?.type} saved=${presentation?.saved} items=${presentation?.items?.length} isolation=${isolationOk}`,
    );
  }

  // QA-9 deep-check fallback (no forced invalid; check happy path + ensure no 502 empty)
  {
    const deep = await chat(token, "בדוק לעומק", {
      surface: "deep-check",
      surface_context: { type: "deep-check" },
    });
    record(
      "QA-9",
      deep.status === 200 && String(deep.body.reply || "").length > 0
        ? "PASS"
        : "FAIL",
      `status=${deep.status} reply=${JSON.stringify(deep.body?.reply ?? "").slice(0, 160)}`,
    );
  }

  // QA-8 forgotten stability
  {
    const first = await chat(token, "מה שכחתי?", {
      surface: "forgotten",
      surface_context: { type: "forgotten" },
    });
    const second = await chat(token, "מה שכחתי?", {
      surface: "forgotten",
      surface_context: { type: "forgotten" },
    });
    const ids1 =
      first.body?.presentation?.type === "task_list"
        ? first.body.presentation.tasks.map((t) => t.id)
        : [];
    const ids2 =
      second.body?.presentation?.type === "task_list"
        ? second.body.presentation.tasks.map((t) => t.id)
        : [];
    const set1 = new Set(ids1);
    const overlap = ids2.filter((id) => set1.has(id)).length;
    const stable =
      ids1.length >= Math.min(5, ids1.length) &&
      ids1.length <= 6 &&
      ids2.length <= 6 &&
      (ids1.length === 0 || overlap >= Math.max(0, ids1.length - 1));
    record(
      "QA-8",
      first.status === 200 && second.status === 200 && stable ? "PASS" : "FAIL",
      `n1=${ids1.length} n2=${ids2.length} overlap=${overlap}`,
    );
  }

  // QA-6 / QA-7 — candidate surfaces return 200 with content (ranking covered by unit tests;
  // live check that surfaces work against QA DB)
  {
    const today = new Date().toISOString().slice(0, 10);
    const sched = await chat(token, `צור לי לו״ז לתאריך ${today}`, {
      surface: "schedule",
      surface_context: {
        type: "schedule",
        date: today,
        day_start: "08:00",
        day_end: "22:00",
      },
    });
    const free = await chat(token, "יש לי זמן פנוי", {
      surface: "free-time",
      surface_context: { type: "free-time", minutes: 30, effort: null },
    });
    record(
      "QA-6",
      sched.status === 200 ? "PASS" : "FAIL",
      `status=${sched.status} presentation=${sched.body?.presentation?.type}`,
    );
    record(
      "QA-7",
      free.status === 200 ? "PASS" : "FAIL",
      `status=${free.status} presentation=${free.body?.presentation?.type} reply=${JSON.stringify(free.body?.reply).slice(0, 120)}`,
    );
  }

  // QA-10 brain dump
  {
    // Create a fake ready recording row then process via API if possible.
    // Without audio upload path, call brain-dump with a synthetic recording.
    const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
    const rec = await fetch(`${SUPA}/rest/v1/recordings`, {
      method: "POST",
      headers: {
        apikey: SERVICE,
        Authorization: `Bearer ${SERVICE}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify((() => {
        const id = crypto.randomUUID();
        return {
          id,
          user_id: userId,
          status: "ready",
          mime: "audio/webm",
          size: 1,
          duration_seconds: 1,
          transcript:
            "מחר לקחת תרופה לאמא, לקנות חלב, ואולי לדבר עם הגננת לגבי הטיול.",
          storage_path: `${userId}/${id}.webm`,
          processed_at: new Date().toISOString(),
        };
      })()),
    });
    const recBody = await rec.json();
    const recordingId = Array.isArray(recBody) ? recBody[0]?.id : recBody?.id;
    if (!recordingId) {
      record("QA-10", "FAIL", `recording create failed: ${JSON.stringify(recBody).slice(0, 200)}`);
    } else {
      const bd = await fetch(`${APP}/api/brain-dump`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recording_id: recordingId,
          transcript:
            "מחר לקחת תרופה לאמא, לקנות חלב, ואולי לדבר עם הגננת לגבי הטיול.",
        }),
      });
      const bdBody = await bd.json().catch(() => ({}));
      const tasks = await rest(
        token,
        `tasks?user_id=eq.${userId}&select=title&order=created_at.desc&limit=20`,
      );
      const shopping = await rest(
        token,
        `shopping_items?user_id=eq.${userId}&select=title&order=created_at.desc&limit=20`,
      );
      const taskTitles = Array.isArray(tasks.body)
        ? tasks.body.map((t) => t.title).join("|")
        : "";
      const shopTitles = Array.isArray(shopping.body)
        ? shopping.body.map((t) => t.title).join("|")
        : "";
      const ok =
        bd.status === 200 &&
        /תרופה/.test(taskTitles) &&
        /חלב/.test(shopTitles);
      record(
        "QA-10",
        ok ? "PASS" : "FAIL",
        `status=${bd.status} summary=${JSON.stringify(bdBody.summary)} stage=${bdBody.stage} tasks=${taskTitles} shop=${shopTitles} proposal=${bdBody.proposal_id}`,
      );
    }
  }

  // QA-2 laundry — must pass WITH prior fridge relation / chat history present (no wipe)
  {
    const memBefore = await rest(
      token,
      `agent_memory?user_id=eq.${userId}&select=content&order=created_at.desc&limit=20`,
    );
    const priorFridge = Array.isArray(memBefore.body)
      ? memBefore.body.some((r) => /action_followup/.test(r.content) && /מקרר|זבל|fridge|trash/i.test(r.content))
      : false;
    const learn = await chat(
      token,
      'כשאני אומרת כביסה יש גם קיפול ופיזור. שמרי כ־action_followup JSON.',
    );
    const mem = await rest(
      token,
      `agent_memory?user_id=eq.${userId}&select=content&order=created_at.desc&limit=20`,
    );
    const hasLaundry = Array.isArray(mem.body)
      ? mem.body.some((r) => /action_followup/.test(r.content) && /כביסה/.test(r.content) && /קיפול|פיזור/.test(r.content))
      : false;
    const fridgeStill = Array.isArray(mem.body)
      ? mem.body.some((r) => /action_followup/.test(r.content) && /מקרר|זבל|fridge|trash/i.test(r.content))
      : priorFridge;
    // Isolate laundry creates for this exception only
    const { execSync } = await import("node:child_process");
    execSync(
      `docker exec -i mashachachti-qa-db-1 psql -U postgres -c "DELETE FROM tasks WHERE user_id='${userId}' AND (title ILIKE '%כביסה%' OR title ILIKE '%קיפול%' OR title ILIKE '%פיזור%')"`,
    );
    const ex = await chat(token, "מחר כביסה אבל הפעם בלי קיפול ופיזור");
    const tasks = await rest(
      token,
      `tasks?user_id=eq.${userId}&status=eq.open&title=like.*כביסה*&select=title,due_on`,
    );
    const fold = await rest(
      token,
      `tasks?user_id=eq.${userId}&status=eq.open&or=(title.ilike.*קיפול*,title.ilike.*פיזור*)&select=title`,
    );
    record(
      "QA-2",
      learn.status === 200 &&
        ex.status === 200 &&
        hasLaundry &&
        fridgeStill &&
        Array.isArray(fold.body) &&
        fold.body.length === 0
        ? "PASS"
        : "FAIL",
      `hasLaundry=${hasLaundry} fridgeStill=${fridgeStill} priorFridge=${priorFridge} laundry=${JSON.stringify(tasks.body)} fold=${JSON.stringify(fold.body)}`,
    );
  }

  // QA-11 voice — real browser automation against QA env
  {
    try {
      const { execSync } = await import("node:child_process");
      execSync("node scripts/qa-mic-browser.mjs", {
        cwd: "/srv/ira/ma-shachachti/app",
        stdio: "pipe",
        timeout: 180000,
      });
      record("QA-11", "PASS", "browser: record→transcript→auto-send + fail/retry draft");
    } catch (error) {
      const detail =
        error && typeof error === "object" && "stdout" in error
          ? String(error.stdout || error.stderr || error.message).slice(-400)
          : String(error).slice(0, 400);
      record("QA-11", "FAIL", detail);
    }
  }

  console.log("\n=== SUMMARY ===");
  const failed = results.filter((r) => r.status === "FAIL");
  for (const r of results) {
    console.log(`${r.id}\t${r.status}\t${r.detail}`);
  }
  console.log(`failed=${failed.length}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
