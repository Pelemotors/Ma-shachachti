import type {
  DailyPlanItem,
  DailyPlanSession,
  ScheduleOverlapEvidence,
} from "@/lib/model";

export function detectTimedOverlaps(
  date: string,
  items: DailyPlanItem[],
): ScheduleOverlapEvidence[] {
  const timed = items.filter(
    (item) => item.plannedStart && item.plannedEnd,
  );
  const evidence: ScheduleOverlapEvidence[] = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i];
      const b = timed[j];
      const aStart = Date.parse(a.plannedStart!);
      const aEnd = Date.parse(a.plannedEnd!);
      const bStart = Date.parse(b.plannedStart!);
      const bEnd = Date.parse(b.plannedEnd!);
      if (aStart < bEnd && bStart < aEnd) {
        evidence.push({
          date,
          requestedRange: {
            taskId: a.taskId,
            start: a.plannedStart!,
            end: a.plannedEnd!,
          },
          conflictingItems: [
            {
              taskId: b.taskId,
              plannedStart: b.plannedStart!,
              plannedEnd: b.plannedEnd!,
              locked: b.locked,
            },
          ],
        });
      }
    }
  }
  return evidence;
}

export function recordPlanOverlaps(
  existing: ScheduleOverlapEvidence[] | undefined,
  plan: DailyPlanSession,
): ScheduleOverlapEvidence[] {
  const next = detectTimedOverlaps(plan.date, plan.items);
  return [...(existing ?? []).filter((row) => row.date !== plan.date), ...next].slice(
    -40,
  );
}
