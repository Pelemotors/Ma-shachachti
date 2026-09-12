import { redactOperationalData } from "./redaction.ts";
import type { SmithEnvironment } from "./types.ts";

export type SmithEvent = {
  eventName: string;
  userId: string | null;
  sessionId: string | null;
  environment: SmithEnvironment;
  source: string;
  metadata: Record<string, unknown>;
  timestamp: string;
};

export type SmithDetection = {
  key: string;
  severity: "warning" | "error" | "critical";
  title: string;
  summary: string;
  evidence: Record<string, unknown>;
};

export function createSmithEvent(
  input: Omit<SmithEvent, "timestamp" | "metadata"> & {
    timestamp?: string;
    metadata?: Record<string, unknown>;
  },
): SmithEvent {
  if (!/^[a-z][a-z0-9_.-]+$/.test(input.eventName)) {
    throw new Error("Invalid Smith event name.");
  }
  return {
    ...input,
    timestamp: input.timestamp ?? new Date().toISOString(),
    metadata: redactOperationalData(input.metadata ?? {}) as Record<
      string,
      unknown
    >,
  };
}

export function detectOperationalAnomaly(
  events: SmithEvent[],
): SmithDetection | null {
  if (!events.length) return null;
  const sorted = [...events].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
  const latest = sorted.at(-1);
  if (!latest) return null;

  const windowStart = Date.parse(latest.timestamp) - 5 * 60 * 1000;
  const recentErrors = sorted.filter(
    (event) =>
      Date.parse(event.timestamp) >= windowStart &&
      ["api.error", "auth.error", "agent.turn.failed"].includes(
        event.eventName,
      ),
  );

  if (recentErrors.length < 3) return null;
  const eventNames = Object.fromEntries(
    [...new Set(recentErrors.map((event) => event.eventName))].map((name) => [
      name,
      recentErrors.filter((event) => event.eventName === name).length,
    ]),
  );

  return {
    key: `repeated-errors:${latest.environment}:${Math.floor(windowStart / 300000)}`,
    severity: recentErrors.length >= 10 ? "critical" : "error",
    title: "ריבוי שגיאות בחלון קצר",
    summary: `${recentErrors.length} שגיאות תפעוליות זוהו בחמש דקות.`,
    evidence: { eventNames, windowMinutes: 5 },
  };
}
