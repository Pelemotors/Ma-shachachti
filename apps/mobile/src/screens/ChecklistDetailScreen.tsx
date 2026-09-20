import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  AppScreen,
  ChecklistRow,
  EmptyState,
  ProgressBlock,
  ScreenHeader,
} from "../components/ui";
import {
  listChecklists,
  toggleChecklistItem,
  type MobileChecklist,
} from "../api/checklists";
import { space } from "../theme";

export function ChecklistDetailScreen({
  listId,
  onBack,
}: {
  listId: string;
  onBack: () => void;
}) {
  const [list, setList] = useState<MobileChecklist | null>(null);

  useEffect(() => {
    void listChecklists()
      .then((data) => setList(data.checklists.find((item) => item.id === listId) ?? null))
      .catch(() => setList(null));
  }, [listId]);

  const done = list?.items.filter((item) => item.checked).length ?? 0;
  const total = list?.items.length ?? 0;

  return (
    <AppScreen>
      <ScreenHeader title={list?.title ?? "צ׳קליסט"} onBack={onBack} />
      <ProgressBlock title={`${done} מתוך ${total}`} done={done} total={total} />
      {!list || list.items.length === 0 ? (
        <EmptyState title="אין פריטים ברשימה" />
      ) : (
        <View style={styles.list}>
          {list.items.map((item) => (
            <ChecklistRow
              key={item.id}
              label={item.text}
              checked={item.checked}
              onToggle={() =>
                void toggleChecklistItem(list.id, item.id, !item.checked).then((data) =>
                  setList(data.checklists.find((entry) => entry.id === listId) ?? null),
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
  list: { gap: space.sm, marginTop: space.lg },
});
