import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { emptyState } from "../lib/model";
import { applyActions } from "../lib/engine";

const one = "10000000-0000-4000-8000-000000000001";
const two = "20000000-0000-4000-8000-000000000002";

async function baseDatabase() {
  const db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,service_role; grant select on auth.users to authenticated,service_role; insert into auth.users values('${one}','one@example.com'),('${two}','two@example.com');`,
  );
  await db.exec(
    await readFile(new URL("../database/schema.sql", import.meta.url), "utf8"),
  );
  return db;
}

test("database ownership, atomic revision checks, reminder sync and server-only quota", async () => {
  const db = await baseDatabase();
  try {
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','${one}',false);`,
    );
    let s = applyActions(emptyState(), [
      { type: "task.create", task: { title: "מטבח" } },
    ]);
    s = applyActions(s, [
      {
        type: "reminder.add",
        title: "בדיקה",
        dueAt: "2030-01-01T10:00:00Z",
        taskId: s.tasks[0].id,
      },
    ]);
    const saved = await db.query<{ save_app_state: number }>(
      "select save_app_state($1::jsonb,0)",
      [JSON.stringify(s)],
    );
    assert.equal(Number(saved.rows[0].save_app_state), 1);
    await assert.rejects(
      db.query("select save_app_state($1::jsonb,0)", [JSON.stringify(s)]),
      /revision_conflict/,
    );
    const revision = await db.query<{ revision: number }>(
      "select revision from app_states",
    );
    assert.equal(Number(revision.rows[0].revision), 1);
    assert.equal(
      (await db.query("select * from reminder_queue")).rows.length,
      1,
    );
    await db.exec(`select set_config('request.jwt.claim.sub','${two}',false)`);
    assert.equal((await db.query("select * from app_states")).rows.length, 0);
    assert.equal(
      (await db.query("select * from reminder_queue")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("insert into app_states(owner_id,data) values($1,$2)", [
        one,
        JSON.stringify(s),
      ]),
      /row-level security/,
    );
    await assert.rejects(
      db.query("select consume_ai_budget($1,$2,2)", [two, "chat"]),
      /permission denied/,
    );
    await db.exec(`select set_config('request.jwt.claim.sub','${one}',false)`);
    s = applyActions(s, [
      { type: "task.status", id: s.tasks[0].id, status: "done" },
    ]);
    await db.query("select save_app_state($1::jsonb,1)", [JSON.stringify(s)]);
    assert.equal(
      (await db.query<{ status: string }>("select status from reminder_queue"))
        .rows[0].status,
      "cancelled",
    );
    await db.exec("reset role; set role service_role;");
    for (let i = 0; i < 3; i++) {
      const result = await db.query<{ consume_ai_budget: boolean }>(
        "select consume_ai_budget($1,$2,2)",
        [one, "chat"],
      );
      assert.equal(result.rows[0].consume_ai_budget, i < 2);
    }
  } finally {
    await db.close();
  }
});

test("clean install can apply every audit migration and enforce approved access", async () => {
  const db = await baseDatabase();
  try {
    const migrations = [
      "20260907_admin_access_and_analytics.sql",
      "20260907_transactional_admin_access.sql",
      "20260907_idempotent_action_saves.sql",
      "20260907_move_auth_helpers_private.sql",
      "20260907_zz_chat_idempotency.sql",
      "20260907_zzz_rls_policy_hardening.sql",
      "20260907_zzzz_action_receipt_hash.sql",
      "20260907_zzzzz_remove_legacy_action_rpc.sql",
      "20260908_pending_proposals_table.sql",
      "20260907_state_v2_pending_proposals.sql",
      "20260908_chat_receipt_claim.sql",
    ];
    for (const name of migrations)
      await db.exec(
        await readFile(
          new URL(`../database/migrations/${name}`, import.meta.url),
          "utf8",
        ),
      );

    await db.exec(
      `insert into public.user_roles(user_id,role,approved) values('${one}','admin',true),('${two}','user',false) on conflict(user_id) do update set role=excluded.role,approved=excluded.approved;`,
    );
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','${two}',false);`,
    );
    const blocked = await db.query("select * from app_states");
    assert.equal(blocked.rows.length, 0);
    const blockedChats = await db.query("select * from chat_receipts");
    assert.equal(blockedChats.rows.length, 0);
    const blockedProposals = await db.query("select * from pending_proposals");
    assert.equal(blockedProposals.rows.length, 0);

    await db.exec(`select set_config('request.jwt.claim.sub','${one}',false);`);
    const s = applyActions(emptyState(), [
      { type: "task.create", task: { title: "בדיקת מיגרציה" } },
    ]);
    const hashedKey = "50000000-0000-4000-8000-000000000005";
    const hashedFirst = await db.query<{
      idempotent_save_app_state: { revision: number };
    }>("select idempotent_save_app_state($1::jsonb,0,$2::uuid,$3::text)", [
      JSON.stringify(s),
      hashedKey,
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ]);
    const hashedReplay = await db.query<{
      idempotent_save_app_state: { revision: number };
    }>("select idempotent_save_app_state($1::jsonb,0,$2::uuid,$3::text)", [
      JSON.stringify(s),
      hashedKey,
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ]);
    assert.equal(
      Number(hashedFirst.rows[0].idempotent_save_app_state.revision),
      1,
    );
    assert.equal(
      Number(hashedReplay.rows[0].idempotent_save_app_state.revision),
      1,
    );
    await assert.rejects(
      db.query(
        "select idempotent_save_app_state($1::jsonb,0,$2::uuid,$3::text)",
        [JSON.stringify(s), hashedKey, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
      ),
      /idempotency_conflict/,
    );
    await assert.rejects(
      db.query("select idempotent_save_app_state($1::jsonb,1,$2::uuid)", [
        JSON.stringify(s),
        "30000000-0000-4000-8000-000000000003",
      ]),
      /does not exist|function/i,
    );

    await db.query(
      "insert into chat_receipts(owner_id,idempotency_key,request_hash,response) values($1,$2,$3,$4::jsonb)",
      [
        one,
        "40000000-0000-4000-8000-000000000004",
        "hash",
        JSON.stringify({ ok: true }),
      ],
    );
    assert.equal(
      (await db.query("select * from chat_receipts")).rows.length,
      1,
    );
    await db.query(
      "insert into pending_proposals(owner_id,type,payload,source_revision) values($1,$2,$3::jsonb,$4)",
      [one, "task_batch", JSON.stringify({ titles: ["א"] }), 1],
    );
    assert.equal(
      (await db.query("select * from pending_proposals")).rows.length,
      1,
    );
    await db.exec(`select set_config('request.jwt.claim.sub','${two}',false);`);
    assert.equal(
      (await db.query("select * from pending_proposals")).rows.length,
      0,
    );
    await db.exec(`select set_config('request.jwt.claim.sub','${one}',false);`);
    const funcs = await db.query<{ nspname: string; proname: string }>(
      "select n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('is_admin','is_approved') order by 1,2",
    );
    assert.ok(funcs.rows.every((x) => x.nspname === "private"));

    // Domain 2: V1 rows remain writable; V2 payloads are accepted after migration.
    const v1Payload = JSON.parse(JSON.stringify(s));
    v1Payload.schemaVersion = 1;
    delete v1Payload.members;
    delete v1Payload.homeAreas;
    delete v1Payload.firstScan;
    delete v1Payload.suggestionHistory;
    delete v1Payload.learning;
    delete v1Payload.compactedMemory;
    delete v1Payload.operations;
    if (v1Payload.planning) delete v1Payload.planning.plan;
    const v2 = emptyState();
    v2.tasks = s.tasks;
    v2.reminders = s.reminders;
    const revAfterV1 = await db.query<{ save_app_state: number }>(
      "select save_app_state($1::jsonb,1)",
      [JSON.stringify(v1Payload)],
    );
    assert.equal(Number(revAfterV1.rows[0].save_app_state), 2);
    const revAfterV2 = await db.query<{ save_app_state: number }>(
      "select save_app_state($1::jsonb,2)",
      [JSON.stringify(v2)],
    );
    assert.equal(Number(revAfterV2.rows[0].save_app_state), 3);
    const stored = await db.query<{ ver: string }>(
      "select data->>'schemaVersion' as ver from app_states where owner_id=$1",
      [one],
    );
    assert.equal(stored.rows[0].ver, "2");
  } finally {
    await db.close();
  }
});
