import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import {
  formatPlanTime,
  getDayPlan,
  replanDay,
  selectOpenTaskIdsForDate,
  todayJerusalemDate,
  type MobileDayPlan,
} from "../api/planning";
import { listTasks } from "../api/tasks";
import { productNowMs, syncProductClock } from "../product/productClock";
import { ErrorText, Hint, PrimaryButton, ScreenShell } from "../ui/chrome";

export function DayPlanScreen({
  onBack,
  mode,
}: {
  onBack: () => void;
  mode: "plan" | "freetime";
}) {
  const [plan, setPlan] = useState<MobileDayPlan | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    await syncProductClock();
    setPlan(await getDayPlan(todayJerusalemDate()));
  }, []);

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : "שגיאה"));
  }, [reload]);

  async function createPlan() {
    setBusy(true);
    setError("");
    try {
      const tasks = await listTasks();
      await syncProductClock();
      const date = todayJerusalemDate();
      const alreadyOnPlan = (plan?.items ?? []).map((item) => item.task_id);
      setPlan(await replanDay(date, selectOpenTaskIdsForDate(tasks.tasks, date, alreadyOnPlan)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "תכנון נכשל");
    } finally {
      setBusy(false);
    }
  }

  const items = plan?.items ?? [];
  const constraints = plan?.constraints ?? [];
  const freeSlots = mode === "freetime" ? describeFreeSlots(items, constraints) : [];

  return (
    <ScreenShell title={mode === "plan" ? "לו״ז היום" : "יש לי זמן פנוי"} onBack={onBack}>
      <Hint>
        {mode === "plan"
          ? "הלו״ז נשמר ב-day_plan בלבד. כניסה למסך לא משנה את הסדר."
          : "הזמן הפנוי מחושב מול לוז היום ואילוצי היומן. משימות שבוצעו לא מוצעות."}
      </Hint>
      {mode === "plan" ? (
        <PrimaryButton
          label={busy ? "מתכנן…" : "צור לי לו״ז"}
          onPress={() => void createPlan()}
          disabled={busy}
        />
      ) : null}
      <ErrorText message={error} />
      {(plan?.conflicts ?? []).map((conflict) => (
        <Text key={conflict.title} style={styles.conflict}>
          התנגשות: {conflict.title}
        </Text>
      ))}
      {mode === "freetime"
        ? freeSlots.map((slot) => (
            <Text key={slot} style={styles.line}>
              {slot}
            </Text>
          ))
        : items.map((item) => (
            <Text key={`${item.task_id}-${item.start_at}`} style={styles.line}>
              {formatPlanTime(item.start_at)}
              {item.end_at ? `–${formatPlanTime(item.end_at)}` : ""} ·{" "}
              {item.kind === "fixed" ? "קבוע" : "גמיש"}
            </Text>
          ))}
      {mode === "freetime" && freeSlots.length === 0 ? (
        <Text style={styles.line}>אין חלון פנוי ברור להיום.</Text>
      ) : null}
      {mode === "plan" && items.length === 0 ? (
        <Text style={styles.line}>עדיין אין לוז להיום.</Text>
      ) : null}
      {constraints.map((event) => (
        <Text key={`${event.start_at}-${event.title}`} style={styles.constraint}>
          אילוץ יומן: {formatPlanTime(event.start_at)}–{formatPlanTime(event.end_at)} {event.title}
        </Text>
      ))}
    </ScreenShell>
  );
}

function describeFreeSlots(
  items: Array<{ start_at: string; end_at?: string | null }>,
  constraints: Array<{ start_at: string; end_at: string }>,
) {
  const blocked = [
    ...items.map((item) => ({
      start: Date.parse(item.start_at),
      end: Date.parse(item.end_at || item.start_at) || Date.parse(item.start_at) + 30 * 60 * 1000,
    })),
    ...constraints.map((event) => ({
      start: Date.parse(event.start_at),
      end: Date.parse(event.end_at),
    })),
  ].sort((a, b) => a.start - b.start);
  const dayStart = blocked[0]
    ? new Date(blocked[0].start).setHours(9, 0, 0, 0)
    : productNowMs();
  const windows: string[] = [];
  let cursor = dayStart;
  for (const block of blocked) {
    if (block.start - cursor >= 45 * 60 * 1000) {
      windows.push(
        `${formatPlanTime(new Date(cursor).toISOString())}–${formatPlanTime(new Date(block.start).toISOString())}`,
      );
    }
    cursor = Math.max(cursor, block.end);
  }
  return windows;
}

const styles = StyleSheet.create({
  line: { textAlign: "right", color: "#3D2B1F", fontWeight: "600" },
  conflict: { textAlign: "right", color: "#8B2E1F" },
  constraint: { textAlign: "right", color: "#8A7464" },
});
