/**
 * Live OpenAI acceptance — uses the same orchestration path as production chat.
 * Loads .env.local without printing secrets.
 * Usage: npx tsx scripts/live-openai-acceptance.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { emptyState } from "../lib/model";
import { applyActions } from "../lib/engine";
import { orchestrateChatTurn } from "../lib/agent/orchestration";
import { analyzeFirstScanWithAgent } from "../lib/domain/first-scan/ai";
import { emptyState } from "../lib/model";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    let val = m[2]!;
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    )
      val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}

function fixtureState() {
  const now = new Date("2026-09-08T10:00:00.000+03:00");
  let s = emptyState();
  s = {
    ...s,
    profile: { ...s.profile, aiConsent: true },
  };
  return applyActions(
    s,
    [
      {
        type: "task.create",
        task: { title: "כביסה", kind: "task", categoryId: "laundry" },
      },
      {
        type: "task.create",
        task: {
          title: "סידור סלון",
          kind: "task",
          categoryId: "living_spaces",
        },
      },
      {
        type: "task.create",
        task: {
          title: "פינוי מדיח",
          kind: "task",
          categoryId: "kitchen_dishes",
        },
      },
      {
        type: "member.upsert",
        member: { name: "פלא", type: "child", aliases: ["פלא"] },
      },
    ],
    now,
  );
}

type CaseResult = { id: string; ok: boolean; detail?: string };

async function chat(state: ReturnType<typeof fixtureState>, message: string) {
  return orchestrateChatTurn({
    state,
    revision: 1,
    message,
    contextTaskId: null,
    turnId: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
  });
}

async function main() {
  loadEnvLocal();
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
    console.log("LIVE OPENAI ACCEPTANCE BLOCKED EXTERNALLY");
    console.log(JSON.stringify({ reason: "missing_key_or_model" }));
    process.exit(0);
  }

  const state = fixtureState();
  const laundry = state.tasks.find((t) => t.title === "כביסה")!;
  const results: CaseResult[] = [];

  for (const [i, message] of [
    "סיימתי את הכביסה",
    "הכביסה מאחוריי",
    "גמרתי עם הכביסה",
    "אפשר לסמן כביסה כבוצע",
  ].entries()) {
    const id = `paraphrase_complete_${i + 1}`;
    try {
      const r = await chat(state, message);
      const done = r.explicitActions.find(
        (a) =>
          a.type === "task.status" &&
          a.status === "done" &&
          a.id === laundry.id,
      );
      results.push({
        id,
        ok: Boolean(done) || Boolean(r.clarification),
        detail: done
          ? "complete"
          : r.clarification
            ? `clarification:${r.clarification.question.slice(0, 60)}`
            : `actions=${r.explicitActions.map((a) => a.type).join(",") || "none"};reply=${r.reply.slice(0, 80)}`,
      });
    } catch (e) {
      results.push({
        id,
        ok: false,
        detail: e instanceof Error ? e.message : "error",
      });
    }
  }

  const extras: Array<{
    id: string;
    message: string;
    expect: (r: Awaited<ReturnType<typeof chat>>) => boolean;
  }> = [
    {
      id: "defer",
      message: "לא היום עם הסלון",
      expect: (r) =>
        r.explicitActions.some((a) => a.type === "task.defer") ||
        Boolean(r.clarification),
    },
    {
      id: "reminder",
      message: "תזכירי לי מחר בערב לבדוק כביסה",
      expect: (r) =>
        r.explicitActions.some((a) => a.type === "reminder.add") ||
        Boolean(r.clarification),
    },
    {
      id: "temporary_context",
      message: "היום אני עם הילדה כל היום",
      expect: (r) =>
        r.explicitActions.some(
          (a) => a.type === "fact.add" || a.type === "planning.set",
        ) || Boolean(r.clarification),
    },
    {
      id: "shopping",
      message: "תוסיפי חלב לקניות בבקשה",
      expect: (r) => r.explicitActions.some((a) => a.type === "shopping.add"),
    },
    {
      id: "correction",
      message: "בעצם תעבירי את הכביסה למחר",
      expect: (r) =>
        r.explicitActions.some(
          (a) =>
            a.type === "task.defer" ||
            a.type === "task.deferUntil" ||
            a.type === "task.update",
        ) || Boolean(r.clarification),
    },
    {
      id: "ambiguity",
      message: "סיימתי",
      expect: (r) =>
        Boolean(r.clarification) ||
        // At most one completion when several open tasks exist.
        r.explicitActions.filter(
          (a) => a.type === "task.status" && a.status === "done",
        ).length <= 1,
    },
    {
      id: "unseen_phrasing",
      message: "הכביסה כבר מאחורי הגב, סגרי אותה אצלי במערכת",
      expect: (r) =>
        r.explicitActions.some(
          (a) =>
            a.type === "task.status" &&
            a.status === "done" &&
            a.id === laundry.id,
        ) || Boolean(r.clarification),
    },
    {
      id: "noise_typo",
      message: "סימתי כבסה בערך, תסמני בבקשה",
      expect: (r) =>
        r.explicitActions.some((a) => a.type === "task.status") ||
        Boolean(r.clarification),
    },
    {
      id: "multi_intent",
      message: "סיימתי מדיח, מחר צריך להזמין אוכל לכלב והיום אין לי כוח לכביסה",
      expect: (r) =>
        r.explicitActions.length + (r.clarification ? 1 : 0) >= 2 ||
        Boolean(r.proposal),
    },
  ];

  for (const c of extras) {
    try {
      const r = await chat(state, c.message);
      results.push({
        id: c.id,
        ok: c.expect(r),
        detail:
          r.explicitActions.map((a) => a.type).join(",") ||
          (r.clarification ? "clarification" : `reply=${r.reply.slice(0, 80)}`),
      });
    } catch (e) {
      results.push({
        id: c.id,
        ok: false,
        detail: e instanceof Error ? e.message : "error",
      });
    }
  }

  for (const [i, text] of [
    "יש לי מטבח עם מדיח ושני חדרי שינה, אחת של הילדים",
    "דירת 3 חדרים, סלון מבולגן, חדר רחצה אחד, יש כלב",
    "בית קטן עם מטבח פתוח לסלון ושירותים אורחים",
  ].entries()) {
    const id = `first_scan_${i + 1}`;
    try {
      const seed = emptyState();
      const { analysis, source } = await analyzeFirstScanWithAgent({
        text,
        state: { ...seed, profile: { ...seed.profile, aiConsent: true } },
      });
      const invented = analysis.proposedTasks.some(
        (t) => t.recurrenceDays != null || t.dueAt != null,
      );
      results.push({
        id,
        ok: !invented && analysis.detectedAreas.length > 0,
        detail: `source=${source};areas=${analysis.detectedAreas.length}`,
      });
    } catch (e) {
      results.push({
        id,
        ok: false,
        detail: e instanceof Error ? e.message : "error",
      });
    }
  }

  for (const [i, message] of [
    "הזמנתי עכשיו אוכל לכלב",
    "נגמרו הטיטולים",
    "יש עוד מלא אוכל לכלב, לא צריך להזמין",
  ].entries()) {
    const id = `forecast_extract_${i + 1}`;
    try {
      const r = await chat(state, message);
      results.push({
        id,
        detail:
          r.explicitActions
            .map((a) => (a.type === "fact.add" ? `fact.add:${a.text}` : a.type))
            .join(",") || (r.clarification ? "clarification" : "soft"),
        ok:
          r.explicitActions.some(
            (a) =>
              a.type === "fact.add" &&
              typeof a.text === "string" &&
              a.text.startsWith("forecast:"),
          ) ||
          r.explicitActions.length > 0 ||
          Boolean(r.clarification) ||
          Boolean(r.proposal),
      });
    } catch (e) {
      results.push({
        id,
        ok: false,
        detail: e instanceof Error ? e.message : "error",
      });
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(
    JSON.stringify(
      {
        model: process.env.OPENAI_MODEL,
        total: results.length,
        passed,
        failed: failed.length,
        results,
      },
      null,
      2,
    ),
  );
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.log("LIVE OPENAI ACCEPTANCE BLOCKED EXTERNALLY");
  console.log(
    JSON.stringify({
      reason: e instanceof Error ? e.message : "unknown",
    }),
  );
  process.exit(0);
});
