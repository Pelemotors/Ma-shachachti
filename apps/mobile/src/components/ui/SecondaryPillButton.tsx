import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radius, rtlText } from "../../theme";

export function SecondaryPillButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, selected ? styles.on : null]}>
      <Text style={[styles.text, selected ? styles.onText : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 48,
    minWidth: 64,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.bgSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  on: { backgroundColor: colors.accent },
  text: { color: colors.text, fontSize: 15, fontWeight: "600", ...rtlText },
  onText: { color: colors.onAccent },
});
