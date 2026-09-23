/**
 * WEEK-01 LOCAL QA CLOCK — removable.
 * BUSINESS TIME ONLY. Never use this for JWT expiry, Supabase session expiry,
 * refresh tokens, OAuth, TLS, request timeouts, or other technical clocks.
 * Auth and security must use wallNow() / Date.now() / new Date().
 * Active only when WEEK_SIMULATION_QA=true and the process is not production/Vercel.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const QA_CLOCK_RELATIVE_PATH = "test-results/week-sim/qa-clock.json";
export const TIME_ZONE = "Asia/Jerusalem";

export type QaClockFile = {
  iso: string;
  label: string;
  setAtRealIso: string;
};

export type QaClockSnapshot = {
  enabled: boolean;
  active: boolean;
  source: "qa" | "real";
  iso: string;
  jerusalemDate: string;
  jerusalemTime: string;
  weekday: string;
  file: QaClockFile | null;
};

function clockPath() {
  return join(process.cwd(), QA_CLOCK_RELATIVE_PATH);
}

export function isWeekSimulationQa() {
  if (process.env.WEEK_SIMULATION_QA !== "true") return false;
  if (process.env.VERCEL) return false;
  if (process.env.NODE_ENV === "production") return false;
  return true;
}

export function readQaClockFile(): QaClockFile | null {
  try {
    const path = clockPath();
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<QaClockFile>;
    if (!parsed?.iso || Number.isNaN(new Date(parsed.iso).getTime())) return null;
    return {
      iso: new Date(parsed.iso).toISOString(),
      label: parsed.label ?? parsed.iso,
      setAtRealIso: parsed.setAtRealIso ?? "",
    };
  } catch {
    return null;
  }
}

export function writeQaClockIso(iso: string, label = iso): QaClockFile {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`qa-clock: invalid time "${iso}"`);
  }
  const file: QaClockFile = {
    iso: instant.toISOString(),
    label,
    setAtRealIso: wallNow().toISOString(),
  };
  const path = clockPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  return file;
}

export function resetQaClock() {
  const path = clockPath();
  if (existsSync(path)) unlinkSync(path);
}

/** Real wall clock. Required for JWT, session refresh, OAuth, TLS, and timeouts. */
export function wallNow(): Date {
  return new Date();
}

export function wallNowMs() {
  return Date.now();
}

export function productNow(): Date {
  if (!isWeekSimulationQa()) return wallNow();
  const file = readQaClockFile();
  if (!file) return wallNow();
  return new Date(file.iso);
}

export function productNowMs() {
  return productNow().getTime();
}

export function productIsoNow() {
  return productNow().toISOString();
}

export function productToday(timeZone = TIME_ZONE) {
  return jerusalemDateOf(productNow(), timeZone);
}

function jerusalemDateOf(instant: Date, timeZone = TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function jerusalemTimeOf(instant: Date, timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function jerusalemWeekdayOf(instant: Date, timeZone = TIME_ZONE) {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone,
    weekday: "long",
  }).format(instant);
}

export function setQaClock(input: string) {
  const instant = new Date(input);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`qa-clock: invalid time "${input}"`);
  }
  return writeQaClockIso(instant.toISOString(), input);
}

export function parseAdvance(spec: string) {
  const raw = spec.trim().toLowerCase();
  const match = raw.match(
    /^(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/,
  );
  if (!match) {
    throw new Error(`qa-clock: invalid advance "${spec}" (use 20m, 45m, 1h, 1d)`);
  }
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === "m" || unit.startsWith("min")) return Math.round(amount * 60_000);
  if (unit.startsWith("h")) return Math.round(amount * 3_600_000);
  return Math.round(amount * 86_400_000);
}

export function advanceQaClock(spec: string) {
  const delta = parseAdvance(spec);
  const base = readQaClockFile()?.iso
    ? new Date(readQaClockFile()!.iso)
    : productNow();
  return writeQaClockIso(
    new Date(base.getTime() + delta).toISOString(),
    `advance ${spec}`,
  );
}

export function describeQaClock(now = productNow()): QaClockSnapshot {
  const file = readQaClockFile();
  const enabled = isWeekSimulationQa();
  const active = enabled && Boolean(file);
  return {
    enabled,
    active,
    source: active ? "qa" : "real",
    iso: now.toISOString(),
    jerusalemDate: jerusalemDateOf(now),
    jerusalemTime: jerusalemTimeOf(now),
    weekday: jerusalemWeekdayOf(now),
    file,
  };
}

export const ProductClock = {
  now: productNow,
  today: productToday,
  isoNow: productIsoNow,
  nowMs: productNowMs,
};

export const TechnicalClock = {
  now: wallNow,
  nowMs: wallNowMs,
};
