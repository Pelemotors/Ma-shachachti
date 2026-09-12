import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "node_modules", "supabase", "dist", "supabase.js");

function runCli(args) {
  const output = execFileSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output);
}

function localStatus() {
  return runCli(["status", "-o", "json"]);
}

function localQuery(sql) {
  return runCli(["db", "query", "--local", "-o", "json", sql]).rows;
}

function requireValue(status, ...keys) {
  for (const key of keys) {
    if (typeof status[key] === "string" && status[key]) return status[key];
  }
  throw new Error(`Supabase Local status is missing ${keys.join(" / ")}`);
}

function jwtClaims(token) {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("Local Auth returned a malformed access token");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

function safeError(error) {
  if (!error) return null;
  return {
    code: error.code ?? null,
    status: error.status ?? null,
    message: String(error.message ?? "denied").replace(
      /(?:eyJ|sb_(?:secret|publishable)_)[A-Za-z0-9._-]+/g,
      "[redacted]",
    ),
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectDenied(label, error, results) {
  assert(error, `${label}: access unexpectedly succeeded`);
  results.push({ check: label, outcome: "DENIED", error: safeError(error) });
}

async function signIn(client, email, password, expectedRole) {
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  assert(
    !error && data.session,
    `Login failed: ${error?.message ?? "no session"}`,
  );
  const claims = jwtClaims(data.session.access_token);
  assert(
    claims.role === expectedRole,
    `Expected JWT role ${expectedRole}, received ${claims.role}`,
  );
  return { session: data.session, claims };
}

async function main() {
  const status = localStatus();
  const url = requireValue(status, "API_URL");
  const publishableKey = requireValue(status, "PUBLISHABLE_KEY", "ANON_KEY");
  const serviceRoleKey = requireValue(status, "SECRET_KEY", "SERVICE_ROLE_KEY");
  assert(
    /^http:\/\/127\.0\.0\.1(?::\d+)?$/.test(url),
    "Refusing to run against a non-local Supabase URL",
  );

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const stamp = `${Date.now()}-${process.pid}`;
  const password = `Local-only-${stamp}!`;
  const testEmail = `smith-test-${stamp}@example.test`;
  const productionEmail = `production-style-${stamp}@example.test`;
  const createdUserIds = [];
  const checks = [];
  const roleConfiguration = localQuery(
    "select rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole, rolreplication from pg_roles where rolname = 'smith_test'",
  )[0];
  const roleMembership = localQuery(
    "select pg_has_role('authenticator', 'smith_test', 'member') as authenticator_member, pg_has_role('authenticated', 'smith_test', 'member') as authenticated_member, pg_has_role('anon', 'smith_test', 'member') as anon_member, pg_has_role('service_role', 'smith_test', 'member') as service_role_member",
  )[0];
  assert(
    roleConfiguration &&
      roleConfiguration.rolcanlogin === false &&
      roleConfiguration.rolinherit === false &&
      roleConfiguration.rolsuper === false &&
      roleConfiguration.rolcreatedb === false &&
      roleConfiguration.rolcreaterole === false &&
      roleConfiguration.rolreplication === false,
    "smith_test PostgreSQL role attributes are unsafe",
  );
  assert(
    roleMembership?.authenticator_member === true &&
      roleMembership.authenticated_member === false &&
      roleMembership.anon_member === false &&
      roleMembership.service_role_member === false,
    "smith_test role membership is unsafe",
  );

  try {
    const testCreate = await admin.auth.admin.createUser({
      email: testEmail,
      password,
      email_confirm: true,
      app_metadata: { environment: "smith_test" },
    });
    assert(
      !testCreate.error,
      `Test user creation failed: ${testCreate.error?.message}`,
    );
    createdUserIds.push(testCreate.data.user.id);

    const productionCreate = await admin.auth.admin.createUser({
      email: productionEmail,
      password,
      email_confirm: true,
      app_metadata: { environment: "production" },
    });
    assert(
      !productionCreate.error,
      `Production-style user creation failed: ${productionCreate.error?.message}`,
    );
    createdUserIds.push(productionCreate.data.user.id);

    const testClient = createClient(url, publishableKey, {
      db: { schema: "smith_test" },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const firstLogin = await signIn(
      testClient,
      testEmail,
      password,
      "smith_test",
    );
    checks.push({
      check: "initial_login",
      outcome: "PASSED",
      jwtRole: firstLogin.claims.role,
      environment: firstLogin.claims.app_metadata?.environment,
    });

    const inserted = await testClient
      .from("probe")
      .insert({ value: "phase-1a" })
      .select("id,owner_id,value")
      .single();
    assert(
      !inserted.error && inserted.data,
      `Probe insert failed: ${inserted.error?.message}`,
    );
    assert(
      inserted.data.owner_id === testCreate.data.user.id,
      "Probe owner does not match JWT subject",
    );

    const selected = await testClient
      .from("probe")
      .select("id,value")
      .eq("id", inserted.data.id)
      .single();
    assert(
      !selected.error && selected.data?.value === "phase-1a",
      "Probe select failed",
    );

    const updated = await testClient
      .from("probe")
      .update({ value: "phase-1a-updated" })
      .eq("id", inserted.data.id)
      .select("value")
      .single();
    assert(
      !updated.error && updated.data?.value === "phase-1a-updated",
      "Probe update failed",
    );

    const removed = await testClient
      .from("probe")
      .delete()
      .eq("id", inserted.data.id)
      .select("id")
      .single();
    assert(
      !removed.error && removed.data?.id === inserted.data.id,
      "Probe delete failed",
    );
    checks.push({ check: "smith_test_probe_crud", outcome: "PASSED" });

    const publicClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await publicClient.auth.setSession({
      access_token: firstLogin.session.access_token,
      refresh_token: firstLogin.session.refresh_token,
    });

    const publicSelect = await publicClient
      .from("smith_poc_production_records")
      .select("*");
    expectDenied("alternate_client_public_table", publicSelect.error, checks);

    const publicInsert = await publicClient
      .from("smith_poc_production_records")
      .insert({ value: "must-not-write" });
    expectDenied("public_table_insert", publicInsert.error, checks);

    const rpc = await publicClient.rpc("smith_poc_production_rpc");
    expectDenied("public_rpc", rpc.error, checks);

    const directRest = await fetch(
      `${url}/rest/v1/smith_poc_production_records?select=*`,
      {
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${firstLogin.session.access_token}`,
        },
      },
    );
    assert(
      !directRest.ok,
      "Direct REST request to public unexpectedly succeeded",
    );
    checks.push({
      check: "direct_rest_public",
      outcome: "DENIED",
      status: directRest.status,
    });

    const storage = await publicClient.storage
      .from("production-recordings")
      .upload(
        `${testCreate.data.user.id}/must-not-write.txt`,
        new TextEncoder().encode("local POC"),
        { contentType: "text/plain" },
      );
    expectDenied("production_style_storage", storage.error, checks);

    const refreshed = await testClient.auth.refreshSession({
      refresh_token: firstLogin.session.refresh_token,
    });
    assert(
      !refreshed.error && refreshed.data.session,
      `Refresh failed: ${refreshed.error?.message}`,
    );
    const refreshClaims = jwtClaims(refreshed.data.session.access_token);
    assert(
      refreshClaims.role === "smith_test",
      "Refresh lost the smith_test role",
    );
    checks.push({
      check: "refresh_token",
      outcome: "PASSED",
      jwtRole: refreshClaims.role,
    });

    await testClient.auth.signOut();
    const newSessionClient = createClient(url, publishableKey, {
      db: { schema: "smith_test" },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const newSession = await signIn(
      newSessionClient,
      testEmail,
      password,
      "smith_test",
    );
    checks.push({
      check: "new_session_token_reissue",
      outcome: "PASSED",
      jwtRole: newSession.claims.role,
    });

    const productionClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const productionLogin = await signIn(
      productionClient,
      productionEmail,
      password,
      "authenticated",
    );
    assert(
      productionLogin.claims.app_metadata?.environment === "production",
      "Production-style app_metadata changed unexpectedly",
    );
    checks.push({
      check: "production_user_role",
      outcome: "PASSED",
      jwtRole: productionLogin.claims.role,
      environment: productionLogin.claims.app_metadata.environment,
    });

    const productionWrite = await productionClient
      .from("smith_poc_production_records")
      .insert({ value: "allowed-production-style-user" })
      .select("id")
      .single();
    assert(
      !productionWrite.error && productionWrite.data,
      `Authenticated control write failed: ${productionWrite.error?.message}`,
    );
    checks.push({
      check: "authenticated_control_access",
      outcome: "PASSED",
    });

    const evidence = {
      phase: "1A",
      environment: "Supabase Local",
      productionConnected: false,
      generatedAt: new Date().toISOString(),
      result: "PASSED",
      roleConfiguration,
      roleMembership,
      assertions: checks,
      secretsPersisted: false,
    };
    const evidencePath = join(
      root,
      "docs",
      "smith",
      "evidence",
      "PHASE_1A_LOCAL.json",
    );
    mkdirSync(dirname(evidencePath), { recursive: true });
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(
      `Phase 1A local security POC passed (${checks.length} checks).`,
    );
    console.log(`Sanitized evidence: ${evidencePath}`);
  } finally {
    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
  }
}

main().catch((error) => {
  console.error(`Phase 1A local security POC failed: ${error.message}`);
  process.exitCode = 1;
});
