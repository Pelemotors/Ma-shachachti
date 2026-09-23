import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ProductTab } from "../../components/ui";
import { HomeV4Icon, type HomeV4IconName } from "./homeV4Icons";
import { heebo, V4 } from "./homeV4Theme";

const TABS: Array<{ id: ProductTab; label: string; icon: HomeV4IconName }> = [
  { id: "shopping", label: "קניות", icon: "cart" },
  { id: "tasks", label: "משימות", icon: "tasks" },
  { id: "chat", label: "שיחה", icon: "chat" },
  { id: "home", label: "בית", icon: "home" },
];

export function HomeBottomNavigation({
  scale,
  active,
  onChange,
}: {
  scale: number;
  active: ProductTab;
  onChange: (tab: ProductTab) => void;
}) {
  const insets = useSafeAreaInsets();
  const s = scale;
  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: 8 * s,
          paddingBottom: Math.max(insets.bottom, 10 * s),
        },
      ]}
    >
      {TABS.map((tab) => {
        const on = tab.id === active;
        const color = on ? V4.sageDeep : V4.navMuted;
        return (
          <Pressable key={tab.id} onPress={() => onChange(tab.id)} style={styles.item} accessibilityLabel={tab.label}>
            <HomeV4Icon name={on && tab.id === "home" ? "home-active" : tab.icon} size={22 * s} color={color} />
            <Text
              style={{
                fontFamily: heebo(on ? "700" : "500"),
                fontSize: 11 * s,
                color,
                marginTop: 3 * s,
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: V4.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: V4.border,
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 44 },
});
