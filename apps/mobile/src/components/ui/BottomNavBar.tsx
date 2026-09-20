import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, type } from "../../theme";

export type ProductTab = "home" | "chat" | "tasks" | "shopping";

const TABS: Array<{
  id: ProductTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconOn: keyof typeof Ionicons.glyphMap;
}> = [
  { id: "home", label: "בית", icon: "home-outline", iconOn: "home" },
  { id: "chat", label: "שיחה", icon: "chatbubble-outline", iconOn: "chatbubble" },
  { id: "tasks", label: "משימות", icon: "checkbox-outline", iconOn: "checkbox" },
  { id: "shopping", label: "קניות", icon: "cart-outline", iconOn: "cart" },
];

export function BottomNavBar({
  active,
  onChange,
  flush = false,
}: {
  active: ProductTab;
  onChange: (id: ProductTab) => void;
  flush?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        flush
          ? { paddingBottom: 2, paddingTop: 2, backgroundColor: "#FBF4EE", height: "100%", minHeight: 0 }
          : { paddingBottom: Math.max(insets.bottom, 8) },
      ]}
    >
      {TABS.map((tab) => {
        const on = tab.id === active;
        return (
          <Pressable key={tab.id} onPress={() => onChange(tab.id)} style={styles.item}>
            <View
              style={[
                styles.iconWrap,
                on && flush ? styles.iconOn : null,
              ]}
            >
              <Ionicons
                name={on ? tab.iconOn : tab.icon}
                size={flush ? 24 : 22}
                color={on ? (flush ? "#A66B59" : colors.accentDeep) : colors.textMuted}
              />
            </View>
            <Text
              style={[
                styles.label,
                { color: on ? (flush ? "#A66B59" : colors.accentDeep) : colors.textMuted, fontWeight: on ? "700" : "500" },
              ]}
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
    flexDirection: "row-reverse",
    backgroundColor: colors.bg,
    paddingTop: 6,
    paddingHorizontal: 4,
    minHeight: 52,
  },
  item: { flex: 1, alignItems: "center", gap: 3, minHeight: 44, justifyContent: "center" },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  iconOn: { backgroundColor: "#F7DED5" },
  label: { ...type.nav, fontSize: 11, lineHeight: 14, textAlign: "center" },
});
