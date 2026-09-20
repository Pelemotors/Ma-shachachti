import { formatInTimeZone, parseIsoUtc, toIsoUtc } from "../utils/dates.ts";

export class VirtualClock {
  private ms: number;
  readonly timeZone: string;
  private lastMs: number;

  constructor(startIso: string, timeZone = "Asia/Jerusalem") {
    this.ms = parseIsoUtc(startIso);
    this.lastMs = this.ms;
    this.timeZone = timeZone;
  }

  now(): Date {
    return new Date(this.ms);
  }

  nowIso(): string {
    return toIsoUtc(this.ms);
  }

  nowInZone(): string {
    return formatInTimeZone(this.nowIso(), this.timeZone);
  }

  setTime(iso: string): void {
    const next = parseIsoUtc(iso);
    if (next < this.ms) {
      throw new Error("VirtualClock refused a backward setTime without reset().");
    }
    this.lastMs = this.ms;
    this.ms = next;
  }

  reset(iso: string): void {
    this.ms = parseIsoUtc(iso);
    this.lastMs = this.ms;
  }

  advanceMinutes(minutes: number): string {
    return this.advanceMs(minutes * 60_000);
  }

  advanceHours(hours: number): string {
    return this.advanceMs(hours * 3_600_000);
  }

  advanceDays(days: number): string {
    return this.advanceMs(days * 86_400_000);
  }

  private advanceMs(delta: number): string {
    if (delta < 0) {
      throw new Error("VirtualClock cannot move backwards.");
    }
    this.lastMs = this.ms;
    this.ms += delta;
    return this.nowIso();
  }

  isMonotonic(): boolean {
    return this.ms >= this.lastMs;
  }
}
