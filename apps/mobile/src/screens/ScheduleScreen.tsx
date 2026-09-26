import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppScreen, BotanicalBackdrop, ChecklistRow, DateTimeField, EmptyState, ScreenHeader } from "../components/ui";
import { formatPlanTime, getDayPlan, jerusalemDateFromNow, todayJerusalemDate, type MobileDayPlan } from "../api/planning";
import { listTasks, type MobileTask } from "../api/tasks";
import { syncProductClock } from "../product/productClock";
import { CL } from "../product/checklistTokens";
import { heebo } from "./home-v4/homeV4Theme";

export function ScheduleScreen({
  onBack,
  onOpenCalendar,
}: {
  onBack: () => void;
  onOpenCalendar?: () => void;
}) {
  const [date, setDate] = useState(todayJerusalemDate());
  const [plan, setPlan] = useState<MobileDayPlan | null>(null);
  const [tasks, setTasks] = useState<MobileTask[]>([]);

  useEffect(() => {
    void (async () => {
      await syncProductClock();
      await Promise.all([
        getDayPlan(date).then(setPlan).catch(() => setPlan(null)),
        listTasks().then((data) => setTasks(data.tasks)).catch(() => setTasks([])),
      ]);
    })();
  }, [date]);

  const items = plan?.items ?? [];
  const today = todayJerusalemDate();
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = jerusalemDateFromNow((1 - weekday + 7) % 7);
  const saturday = jerusalemDateFromNow((6 - weekday + 7) % 7);

  return (
    <AppScreen padded={false} decor={false}>
      <BotanicalBackdrop />
      <View style={styles.page}>
        <ScreenHeader title="הלו״ז שלך" onBack={onBack} />
        <View style={styles.chips}>
          <Pressable onPress={() => setDate(today)} style={[styles.chip, date === today && styles.chipOn]}>
            <Text style={styles.chipText}>היום</Text>
          </Pressable>
          <Pressable onPress={() => setDate(jerusalemDateFromNow(1))} style={[styles.chip, date === jerusalemDateFromNow(1) && styles.chipOn]}>
            <Text style={styles.chipText}>מחר</Text>
          </Pressable>
          <Pressable onPress={() => setDate(monday)} style={[styles.chip, date === monday && styles.chipOn]}>
            <Text style={styles.chipText}>יום ב׳</Text>
          </Pressable>
          <Pressable onPress={() => setDate(saturday)} style={[styles.chip, date === saturday && styles.chipOn]}>
            <Text style={styles.chipText}>שבת</Text>
          </Pressable>
        </View>
        <DateTimeField label="תאריך בלוז" mode="date" value={date} emptyLabel="בחרי תאריך" onChange={setDate} />
        {items.length === 0 ? (
          <EmptyState title="אין שיבוץ ליום הזה" body="דדליין לא נכנס לכאן לבד. שגרה עם שעה מופיעה אוטומטית." />
        ) : (
          <View style={styles.list}>
            {items.map((item) => (
              <ChecklistRow
                key={item.occurrence_key ?? `${item.task_id}-${item.start_at}`}
                label={tasks.find((task) => task.id === item.task_id)?.title ?? "פריט בלו״ז"}
                trailing={formatPlanTime(item.start_at)}
              />
            ))}
          </View>
        )}
        {onOpenCalendar ? (
          <Pressable onPress={onOpenCalendar} style={styles.calendar}>
            <Text style={styles.calendarText}>יומן Google</Text>
          </Pressable>
        ) : null}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 20 },
  chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: CL.border, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: CL.surface },
  chipOn: { backgroundColor: CL.peach, borderColor: CL.terracotta },
  chipText: { fontFamily: heebo("500"), fontSize: 13, color: CL.text },
  list: { gap: 8 },
  calendar: { alignSelf: "flex-start", marginTop: 16 },
  calendarText: { fontFamily: heebo("600"), color: CL.terracotta },
});
