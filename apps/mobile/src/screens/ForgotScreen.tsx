import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppScreen, ChecklistRow, EmptyState, PrimaryActionButton, ScreenHeader } from "../components/ui";
import { completeTask, listTasks, type MobileTask } from "../api/tasks";
import { productNowMs } from "../product/productClock";
import { rtlText, space, type } from "../theme";

function isForgotten(task: MobileTask) {
  if (task.status !== "open") return false;
  if (!task.due_on && !task.due_at) return true;
  if (task.due_at && Date.parse(task.due_at) < productNowMs()) return true;
  return false;
}

export function ForgotScreen({ onBack }: { onBack: () => void }) {
  const [tasks, setTasks] = useState<MobileTask[]>([]);

  useEffect(() => {
    void listTasks()
      .then((data) => setTasks(data.tasks.filter(isForgotten)))
      .catch(() => setTasks([]));
  }, []);

  return (
    <AppScreen
      footer={
        <View style={styles.footer}>
          <PrimaryActionButton label="הוספת תזכורת" onPress={onBack} disabled />
        </View>
      }
    >
      <ScreenHeader title="מה שכחתי?" onBack={onBack} icon="sparkles-outline" />
      <Text style={styles.sub}>AI מזכיר מה שעשית — וממה שפספסת.</Text>
      {tasks.length === 0 ? (
        <EmptyState title="אין כרגע דברים ששכחת" body="כשיופיעו משימות בלי זמן או באיחור, הן יופיעו כאן." />
      ) : (
        <View style={styles.list}>
          {tasks.map((task) => (
            <ChecklistRow
              key={task.id}
              label={task.title}
              onToggle={() =>
                void completeTask(task.id).then((data) =>
                  setTasks(data.tasks.filter(isForgotten)),
                )
              }
            />
          ))}
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  sub: { ...type.body, ...rtlText, marginBottom: space.lg },
  list: { gap: space.sm },
  footer: { paddingHorizontal: 24, paddingBottom: 16 },
});
