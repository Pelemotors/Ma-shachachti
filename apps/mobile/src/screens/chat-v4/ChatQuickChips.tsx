import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { HomeV4Icon, type HomeV4IconName } from "../home-v4/homeV4Icons";
import { CHAT, heebo } from "./chatV4Theme";

const CHIPS: Array<{ id: "task" | "plan" | "shopping"; label: string; icon: HomeV4IconName }> = [
  { id: "task", label: "הוסף משימה", icon: "tasks" },
  { id: "plan", label: "בנה לי לו״ז", icon: "calendar" },
  { id: "shopping", label: "קניות", icon: "cart" },
];

export function ChatQuickChips({
  scale,
  onChip,
}: {
  scale: number;
  onChip: (id: "task" | "plan" | "shopping") => void;
}) {
  const s = scale;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: 16 * s,
        gap: 8 * s,
        paddingVertical: 8 * s,
        flexDirection: "row-reverse",
      }}
    >
      {CHIPS.map((chip) => (
        <Pressable
          key={chip.id}
          onPress={() => onChip(chip.id)}
          accessibilityLabel={chip.label}
          style={[
            styles.chip,
            {
              height: 40 * s,
              borderRadius: 22 * s,
              paddingHorizontal: 12 * s,
              gap: 6 * s,
            },
          ]}
        >
          <HomeV4Icon name={chip.icon} size={16 * s} color={CHAT.text} />
          <Text
            style={{
              fontFamily: heebo("500"),
              fontSize: 13 * s,
              lineHeight: 18 * s,
              color: CHAT.text,
            }}
          >
            {chip.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CHAT.chip,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CHAT.chipBorder,
    minWidth: 48,
  },
});
