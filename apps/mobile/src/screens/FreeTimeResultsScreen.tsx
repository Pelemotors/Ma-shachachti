import { useEffect, useState } from "react";
import { BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import { AppScreen, EmptyState, ScreenHeader } from "../components/ui";
import { getDayPlan, jerusalemDateFromNow } from "../api/planning";
import { listRoutines } from "../api/routines";
import { listTasks, updateTask, type MobileTask } from "../api/tasks";
import { resolveFreetimeMinutes, taskFitsFreeTimeWindow } from "../product/surfaceCommit";
import { selectFreeTimeCandidates, type FreeTimeCandidate, type FreeTimeEnergy } from "../product/freeTimeCandidates";
import { rtlText, space, type } from "../theme";

export function FreeTimeResultsScreen({ minutes, energy, onBack, onAdjust }: { minutes: number; energy?: FreeTimeEnergy | null; onBack: () => void; onAdjust?: () => void }) {
  const selectedMinutes = resolveFreetimeMinutes(minutes);
  const [tasks, setTasks] = useState<FreeTimeCandidate[]>([]);
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const date = jerusalemDateFromNow();
    void Promise.all([listTasks(), getDayPlan(date), listRoutines(date)])
      .then(([taskData, plan, routineData]) => {
        if (cancelled) return;
        const eligible = taskData.tasks.filter((task) => taskFitsFreeTimeWindow(task, selectedMinutes));
        setTasks(selectFreeTimeCandidates({ tasks: eligible, planItems: plan.items, routines: routineData.routines, date, minutes: selectedMinutes, energy, offset }));
      })
      .catch(() => { if (!cancelled) setTasks([]); });
    return () => { cancelled = true; };
  }, [energy, offset, selectedMinutes]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { onBack(); return true; });
    return () => sub.remove();
  }, [onBack]);

  async function choose(task: MobileTask) {
    if (selectedId) return;
    setError("");
    setSelectedId(task.id);
    const date = jerusalemDateFromNow();
    const now = new Date();
    const start = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
    const [hour, minute] = start.split(":").map(Number);
    const duration = Math.min(task.estimate_minutes ?? selectedMinutes, selectedMinutes);
    const endDate = new Date(Date.UTC(2020, 0, 1, hour, minute + duration));
    const end = `${String(endDate.getUTCHours()).padStart(2, "0")}:${String(endDate.getUTCMinutes()).padStart(2, "0")}`;
    try {
      await updateTask(task.id, { plan_patch: "set", planned_date: date, planned_start_time: start, planned_end_time: end });
    } catch (e) {
      setSelectedId(null);
      setError(e instanceof Error ? e.message : "לא הצלחנו לשבץ את המשימה.");
    }
  }

  return (
    <AppScreen footerOwnsBottomInset footer={<View style={styles.footer}>
      <Pressable accessibilityRole="button" accessibilityLabel="סיום וחזרה" onPress={onBack} style={styles.done}><Text style={[type.body, rtlText, styles.doneText]}>סיום וחזרה</Text></Pressable>
      {onAdjust ? <Pressable accessibilityRole="button" accessibilityLabel="שנה משך" onPress={onAdjust} style={styles.adjust}><Text style={[type.body, rtlText]}>שנה משך</Text></Pressable> : null}
    </View>}>
      <ScreenHeader title="יש לי זמן פנוי" onBack={onBack} icon="time-outline" />
      <Text style={styles.sub} accessibilityLabel={`משך נבחר ${selectedMinutes} דקות`}>משימות עד {selectedMinutes} דקות</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {tasks.length === 0 ? <EmptyState title="אין משימות פתוחות שמתאימות עכשיו" /> : <View style={styles.list}>
        {tasks.map((task) => <Pressable key={task.id} accessibilityRole="button" accessibilityLabel={`בחר ${task.title}`} disabled={Boolean(selectedId)} onPress={() => void choose(task)} style={styles.row}>
          <View style={styles.rowCopy}><Text style={[type.body, rtlText]}>{task.title}</Text><Text style={[type.caption, rtlText, styles.reason]}>{task.reason}</Text></View><Text style={[type.caption, styles.choose]}>בחר</Text>
        </Pressable>)}
      </View>}
      <Pressable accessibilityRole="button" accessibilityLabel="משהו אחר" onPress={() => setOffset((value) => value + 3)} style={styles.other}><Text style={[type.body, rtlText]}>משהו אחר</Text></Pressable>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  sub: { ...type.body, ...rtlText, marginBottom: space.lg }, list: { gap: space.sm, marginBottom: space.lg },
  row: { padding: 16, borderRadius: 14, backgroundColor: "#F4F1EA", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowCopy: { flex: 1, alignItems: "flex-end" }, reason: { color: "#6B746D", marginTop: 4 }, choose: { color: "#2F3E34", marginLeft: 12 }, other: { alignItems: "center", paddingVertical: 12, marginBottom: space.lg }, error: { ...type.body, ...rtlText, color: "#A23B3B", marginBottom: space.sm },
  footer: { paddingHorizontal: 24, paddingBottom: 16 }, done: { paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: "#2F3E34" }, doneText: { color: "#FFFFFF" }, adjust: { marginTop: space.sm, paddingVertical: 12, alignItems: "center" },
});
