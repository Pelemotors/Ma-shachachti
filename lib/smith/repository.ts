import type { SupabaseClient } from "@supabase/supabase-js";
import { emptySmithDashboard, getSmithSetupState } from "./dashboard.ts";
import type {
  SmithDashboardData,
  SmithObservation,
  SmithWorkItem,
} from "./types.ts";

function requireNoError(
  label: string,
  result: { error: { message: string } | null },
) {
  if (result.error) {
    throw new Error(`Smith ${label} query failed: ${result.error.message}`);
  }
}

export async function loadSmithDashboard(
  db: SupabaseClient,
): Promise<SmithDashboardData> {
  const control = db.schema("smith_control");
  const [workItems, observations, previews, tests, approvals, audit, jobs] =
    await Promise.all([
      control
        .from("smith_work_items")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(10),
      control
        .from("smith_observations")
        .select(
          "id,work_item_id,event_name,source,environment,severity,title,summary,evidence,metrics,observed_at",
        )
        .order("observed_at", { ascending: false })
        .limit(10),
      control
        .from("smith_previews")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5),
      control
        .from("smith_test_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5),
      control
        .from("smith_approvals")
        .select("*")
        .eq("status", "requested")
        .order("requested_at", { ascending: false })
        .limit(5),
      control
        .from("smith_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10),
      control
        .from("smith_jobs")
        .select("id,status,job_type,work_item_id")
        .eq("status", "running")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  for (const [label, result] of [
    ["work items", workItems],
    ["observations", observations],
    ["previews", previews],
    ["tests", tests],
    ["approvals", approvals],
    ["audit", audit],
    ["jobs", jobs],
  ] as const) {
    requireNoError(label, result);
  }

  const base = emptySmithDashboard();
  return {
    ...base,
    enabled: true,
    setup: getSmithSetupState(),
    summary: {
      ...base.summary,
      activeIncidents:
        (observations.data ?? []).filter((item) =>
          ["error", "critical"].includes(item.severity),
        ).length || 0,
      readyPreviews:
        (previews.data ?? []).filter(
          (item) => item.status === "ready" && !item.is_stale,
        ).length || 0,
      pendingApprovals: approvals.data?.length ?? 0,
    },
    currentJob: jobs.data
      ? {
          id: jobs.data.id,
          status: jobs.data.status,
          jobType: jobs.data.job_type,
          workItemId: jobs.data.work_item_id,
        }
      : null,
    workItems: (workItems.data ?? []) as SmithWorkItem[],
    observations: (observations.data ?? []) as SmithObservation[],
    previews: previews.data ?? [],
    tests: tests.data ?? [],
    approvals: approvals.data ?? [],
    audit: audit.data ?? [],
  };
}
