import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppScreen, CategoryTile, EmptyState, ScreenHeader } from "../components/ui";
import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";
import { listChecklists, type MobileChecklist } from "../api/checklists";
import { rtlText, space, type } from "../theme";

const ICONS: Array<ComponentProps<typeof Ionicons>["name"]> = [
  "restaurant-outline",
  "home-outline",
  "cart-outline",
  "happy-outline",
  "airplane-outline",
  "heart-outline",
  "leaf-outline",
  "briefcase-outline",
];

export function ChecklistsScreen({
  onBack,
  onOpen,
}: {
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const [lists, setLists] = useState<MobileChecklist[]>([]);

  useEffect(() => {
    void listChecklists()
      .then((data) => setLists(data.checklists))
      .catch(() => setLists([]));
  }, []);

  const rows: MobileChecklist[][] = [];
  for (let i = 0; i < lists.length; i += 2) rows.push(lists.slice(i, i + 2));

  return (
    <AppScreen>
      <ScreenHeader title="צ׳קליסטים" onBack={onBack} />
      <Text style={styles.sub}>רשימות מוכנות לכל דבר</Text>
      {lists.length === 0 ? (
        <EmptyState title="אין עדיין רשימות" body="כשתיווצר רשימה אמיתית, היא תופיע כאן כאריח." />
      ) : (
        rows.map((row) => (
          <View key={row.map((item) => item.id).join("-")} style={styles.grid}>
            {row.map((list, index) => (
              <CategoryTile
                key={list.id}
                title={list.title}
                icon={ICONS[(lists.indexOf(list) + index) % ICONS.length]}
                onPress={() => onOpen(list.id)}
              />
            ))}
            {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
          </View>
        ))
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  sub: { ...type.body, ...rtlText, marginBottom: space.lg },
  grid: { flexDirection: "row-reverse", gap: 12, marginBottom: 12 },
});
