import { adminJsonError } from "@/lib/admin-api";
import { createServiceClient } from "@/lib/supabase-admin";
import { authorizeAdmin, HttpError } from "@/lib/server-auth";
import {
  assertSmithCapability,
  type SmithCapability,
} from "@/lib/smith/capabilities";
import { getSmithSetupState, smithControlEnabled } from "@/lib/smith/dashboard";
import { validateSmithJob } from "@/lib/smith/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const jobCapabilities: Record<string, SmithCapability> = {
  "investigation.start": "read_system_events",
  "tests.run": "run_tests",
  "browser-tests.run": "run_browser_tests",
  "preview.deploy": "deploy_preview",
};

export async function POST(req: Request) {
  try {
    const admin = await authorizeAdmin(req);
    if (!smithControlEnabled()) {
      throw new HttpError(503, "Smith Control Plane עדיין לא הוגדר.");
    }
    const body = await req.json().catch(() => null);
    const capability = jobCapabilities[body?.jobType];
    if (!capability) throw new HttpError(400, "סוג ה־Job אינו מורשה.");

    const db = createServiceClient().schema("smith_control");
    const killSwitch = await db
      .from("smith_settings")
      .select("value")
      .eq("key", "kill_switch")
      .single();
    if (killSwitch.error) throw new HttpError(503, "מצב Smith אינו זמין.");
    const killSwitchValue = killSwitch.data.value as { active?: boolean };
    const killSwitchActive = killSwitchValue.active !== false;
    if (killSwitchActive) {
      return Response.json(
        { error: "Smith kill switch is active." },
        { status: 423 },
      );
    }

    const setup = getSmithSetupState();
    assertSmithCapability(capability, {
      environment: "preview",
      killSwitchActive,
      githubConnected: setup.github === "connected",
      testEnvironmentConnected: setup.testEnvironment === "connected",
      previewConnected: setup.preview === "connected",
    });

    const job = validateSmithJob({
      jobType: body.jobType,
      workItemId: body.workItemId,
      payload: body.payload,
      idempotencyKey: body.idempotencyKey,
    });
    const inserted = await db
      .from("smith_jobs")
      .insert(job)
      .select("*")
      .single();
    if (inserted.error?.code === "23505") {
      const existing = await db
        .from("smith_jobs")
        .select("*")
        .eq("idempotency_key", job.idempotency_key)
        .single();
      if (existing.error) throw new HttpError(503, "טעינת Job קיים נכשלה.");
      return Response.json({ job: existing.data, replay: true });
    }
    if (inserted.error) throw new HttpError(503, "יצירת Job נכשלה.");

    await db.from("smith_audit_log").insert({
      action: "job.enqueued",
      actor_type: "admin",
      actor_id: admin.userId,
      environment: "preview",
      target_type: "job",
      target_id: inserted.data.id,
      work_item_id: job.work_item_id,
      status: "completed",
      metadata: { jobType: job.job_type },
    });

    return Response.json(
      { job: inserted.data, replay: false },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("kill switch")) {
      return Response.json({ error: error.message }, { status: 423 });
    }
    return adminJsonError(error);
  }
}
