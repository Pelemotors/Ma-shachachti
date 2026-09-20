import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppScreen, ChecklistRow, EmptyState, PrimaryActionButton, ScreenHeader } from "../components/ui";
import { formatPlanTime, getDayPlan, todayJerusalemDate, type MobileDayPlan } from "../api/planning";
import { listTasks, type MobileTask } from "../api/tasks";
import { space } from "../theme";

export function ScheduleScreen({
  onBack,
  onOpenCalendar,
}: {
  onBack: () => void;
  onOpenCalendar?: () => void;
}) {
  const [plan, setPlan] = useState<MobileDayPlan | null>(null);
  const [tasks, setTasks] = useState<MobileTask[]>([]);

  useEffect(() => {
    void getDayPlan(todayJerusalemDate())
      .then(setPlan)
      .catch(() => setPlan(null));
    void listTasks()
      .then((data) => setTasks(data.tasks))
      .catch(() => setTasks([]));
  }, []);

  const items = plan?.items ?? [];

  return (
    <AppScreen
      footer={
        <View style={styles.footer}>
          {onOpenCalendar ? (
            <PrimaryActionButton label="יומן Google" onPress={onOpenCalendar} />
          ) : null}
          <PrimaryActionButton label="שמור ללו״ז" onPress={onBack} />
        </View>
      }
    >
      <ScreenHeader title="הלו״ז שלך!" onBack={onBack} icon="calendar-outline" />
      {items.length === 0 ? (
        <EmptyState title="עדיין אין לו״ז להיום" />
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <ChecklistRow
              key={`${item.task_id}-${item.start_at}`}
              label={tasks.find((task) => task.id === item.task_id)?.title ?? "פריט בלו״ז"}
              trailing={formatPlanTime(item.start_at)}
            />
          ))}
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  footer: { paddingHorizontal: 24, paddingBottom: 16 },
});
