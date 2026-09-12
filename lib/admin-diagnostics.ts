import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  summarizeAdminApiResponses,
  type AdminApiCheckResponse,
  type AdminDiagnosticCheck,
  type DiagnosticResult,
  type DiagnosticStatus,
} from "./admin-diagnostic-contract.ts";
import { vapidConfigured } from "./push.ts";
import { redactOperationalData, redactText } from "./smith/redaction.ts";
import { createServiceClient } from "./supabase-admin.ts";

const execFileAsync = promisify(execFile);

function result(
  check: AdminDiagnosticCheck,
  started: number,
  status: DiagnosticStatus,
  summary: string,
  details?: Record<string, unknown>,
  warnings: string[] = [],
): DiagnosticResult {
  const completedAt = new Date().toISOString();
  return {
    check,
    status,
    summary,
    startedAt: new Date(started).toISOString(),
    completedAt,
    durationMs: Date.now() - started,
    warnings,
    details: details
      ? (redactOperationalData(details) as Record<string, unknown>)
      : undefined,
  };
}

export async function checkDatabase(): Promise<DiagnosticResult> {
  const started = Date.now();
  try {
    const db = createServiceClient();
    const { count, error } = await db
      .from("user_roles")
      .select("user_id", { count: "exact", head: true });
    if (error) {
      return result("database", started, "fail", "בדיקת מסד הנתונים נכשלה.", {
        code: error.code,
      });
    }
    return result("database", started, "pass", "מסד הנתונים זמין ומגיב.", {
      userRoleRows: count,
    });
  } catch {
    return result("database", started, "fail", "חיבור מסד הנתונים אינו זמין.");
  }
}

export async function checkAuth(
  adminUserId: string,
): Promise<DiagnosticResult> {
  const started = Date.now();
  try {
    const db = createServiceClient();
    const { data, error } = await db.auth.admin.getUserById(adminUserId);
    if (error || !data.user) {
      return result("auth", started, "fail", "Auth לא אימת את חשבון המנהל.", {
        code: error?.code ?? "user_missing",
      });
    }
    return result("auth", started, "pass", "Auth וחשבון המנהל זמינים.", {
      userId: data.user.id,
      emailConfirmed: Boolean(data.user.email_confirmed_at),
    });
  } catch {
    return result("auth", started, "fail", "שירות Auth אינו זמין.");
  }
}

export async function checkOpenAI(): Promise<DiagnosticResult> {
  const started = Date.now();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna";
  if (!apiKey) {
    return result(
      "openai",
      started,
      "not_configured",
      "חיבור OpenAI לא הוגדר.",
      { model },
    );
  }
  try {
    const response = await fetch(
      `https://api.openai.com/v1/models/${encodeURIComponent(model)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      return result("openai", started, "fail", "OpenAI החזיר תשובת שגיאה.", {
        httpStatus: response.status,
        model,
      });
    }
    return result("openai", started, "pass", "OpenAI והמודל זמינים.", {
      model,
    });
  } catch {
    return result("openai", started, "fail", "לא התקבלה תשובה מ־OpenAI.", {
      model,
    });
  }
}

export async function checkStorage(): Promise<DiagnosticResult> {
  const started = Date.now();
  try {
    const db = createServiceClient();
    const { data, error } = await db.storage.listBuckets();
    if (error) {
      return result("storage", started, "fail", "בדיקת Storage נכשלה.", {
        code: error.name,
      });
    }
    const recordings = data.find((bucket) => bucket.name === "recordings");
    if (!recordings) {
      return result(
        "storage",
        started,
        "partial",
        "Storage זמין, אך bucket ההקלטות לא נמצא.",
        { bucketCount: data.length },
        ["recordings_bucket_missing"],
      );
    }
    if (recordings.public) {
      return result(
        "storage",
        started,
        "fail",
        "Storage זמין, אך bucket ההקלטות מוגדר כציבורי.",
        { bucketCount: data.length, recordingsPublic: true },
      );
    }
    return result(
      "storage",
      started,
      "pass",
      "Storage וה־bucket הפרטי זמינים.",
      {
        bucketCount: data.length,
        recordingsPublic: recordings.public,
      },
    );
  } catch {
    return result("storage", started, "fail", "Storage אינו זמין.");
  }
}

export async function checkPushAndReminders(): Promise<DiagnosticResult> {
  const started = Date.now();
  const pushConfigured = vapidConfigured();
  const cronConfigured = Boolean(process.env.CRON_SECRET?.trim());
  let lastRun: { event_type: string; created_at: string } | null = null;
  try {
    const { data } = await createServiceClient()
      .from("activity_events")
      .select("event_type,created_at")
      .in("event_type", ["cron.reminders.success", "cron.reminders.failure"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    lastRun = data;
  } catch {
    // Configuration state remains useful even if telemetry is unavailable.
  }
  const failed = lastRun?.event_type === "cron.reminders.failure";
  const status: DiagnosticStatus =
    !pushConfigured || !cronConfigured
      ? "not_configured"
      : failed
        ? "fail"
        : lastRun
          ? "pass"
          : "partial";
  const summary =
    status === "pass"
      ? "Push ותהליך התזכורות מוגדרים; הריצה האחרונה הצליחה."
      : status === "fail"
        ? "ריצת התזכורות האחרונה נכשלה."
        : status === "partial"
          ? "Push ו־Cron מוגדרים, אך אין עדיין תוצאת ריצה."
          : "Push או Cron אינם מוגדרים במלואם.";
  return result(
    "push-reminders",
    started,
    status,
    summary,
    {
      pushConfigured,
      cronConfigured,
      lastRunAt: lastRun?.created_at ?? null,
      lastRunStatus: lastRun?.event_type ?? null,
    },
    [
      ...(!pushConfigured ? ["push_not_configured"] : []),
      ...(!cronConfigured ? ["cron_not_configured"] : []),
      ...(status === "partial" ? ["no_reminder_run_evidence"] : []),
    ],
  );
}

export function checkAdminApiResponses(
  responses: AdminApiCheckResponse[],
  started: number,
) {
  const summary = summarizeAdminApiResponses(responses);
  return result("admin-apis", started, summary.status, summary.summary, {
    endpoints: responses,
  });
}

function commandEnvironment(
  nodeEnv: "test" | "development",
): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    Path: process.env.Path,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    NODE_ENV: nodeEnv,
    ...(nodeEnv === "test" ? { CI: "true" } : {}),
    NO_COLOR: "1",
  };
}

export async function runLocalDiagnosticCommand(
  check: "unit-tests" | "playwright",
): Promise<DiagnosticResult> {
  const started = Date.now();
  if (process.env.NODE_ENV !== "development") {
    return result(
      check,
      started,
      "not_configured",
      "הרצת פקודות זמינה רק בשרת פיתוח מקומי.",
    );
  }
  const args =
    check === "unit-tests"
      ? [
          "--experimental-strip-types",
          "--test",
          ...(
            await readdir(join(process.cwd(), "tests"), {
              withFileTypes: true,
            })
          )
            .filter(
              (entry) => entry.isFile() && entry.name.endsWith(".test.ts"),
            )
            .map((entry) => join("tests", entry.name)),
        ]
      : [
          join(process.cwd(), "node_modules", "@playwright", "test", "cli.js"),
          "test",
        ];
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, args, {
      cwd: process.cwd(),
      env: commandEnvironment(check === "playwright" ? "development" : "test"),
      timeout: check === "playwright" ? 180_000 : 90_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    const output = redactText(`${stdout}\n${stderr}`)
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-20)
      .join("\n");
    return result(
      check,
      started,
      "pass",
      check === "unit-tests"
        ? "בדיקות היחידה והאינטגרציה עברו."
        : "בדיקות Playwright עברו.",
      { output },
    );
  } catch (error) {
    const execution = error as {
      stdout?: string;
      stderr?: string;
      killed?: boolean;
      code?: string | number;
    };
    const output = redactText(
      `${execution.stdout ?? ""}\n${execution.stderr ?? ""}`,
    )
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-20)
      .join("\n");
    return result(check, started, "fail", "הרצת הבדיקות נכשלה.", {
      code: execution.code ?? "unknown",
      timedOut: Boolean(execution.killed),
      output,
    });
  }
}

export async function runFullHealth(
  adminUserId: string,
  adminApiResponses: AdminApiCheckResponse[],
  started = Date.now(),
): Promise<DiagnosticResult> {
  const checks = await Promise.all([
    checkDatabase(),
    checkAuth(adminUserId),
    checkOpenAI(),
    checkStorage(),
    checkPushAndReminders(),
  ]);
  checks.push(checkAdminApiResponses(adminApiResponses, started));
  const failed = checks.filter((check) => check.status === "fail").length;
  const incomplete = checks.filter(
    (check) => check.status === "partial" || check.status === "not_configured",
  ).length;
  const status: DiagnosticStatus = failed
    ? "fail"
    : incomplete
      ? "partial"
      : "pass";
  const subsystems = [
    {
      subsystem: "Application",
      status: "pass",
      summary: "ה־Admin diagnostic endpoint זמין.",
    },
    ...checks.map((check) => ({
      subsystem:
        check.check === "admin-apis"
          ? "Admin APIs"
          : check.check === "push-reminders"
            ? "Push / Reminders"
            : check.check === "openai"
              ? "AI"
              : check.check[0].toUpperCase() + check.check.slice(1),
      status: check.status,
      summary: check.summary,
    })),
  ];
  const warnings = checks
    .filter(
      (check) =>
        check.status === "partial" || check.status === "not_configured",
    )
    .map((check) => check.summary);
  const failures = checks
    .filter((check) => check.status === "fail")
    .map((check) => check.summary);
  return result(
    "full-health",
    started,
    status,
    failed
      ? `בדיקת הבריאות מצאה ${failed} כשלים.`
      : incomplete
        ? `המערכת מגיבה, אך ${incomplete} רכיבים אינם מלאים.`
        : "כל בדיקות הבריאות עברו.",
    {
      subsystems,
      failures,
      warnings,
    },
    warnings,
  );
}
