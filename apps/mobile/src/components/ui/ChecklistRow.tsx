import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, rtlText, space } from "../../theme";

export function ChecklistRow({
  label,
  checked,
  onToggle,
  icon,
  trailing,
}: {
  label: string;
  checked?: boolean;
  onToggle?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  trailing?: string;
}) {
  return (
    <Pressable onPress={onToggle} disabled={!onToggle} style={styles.row}>
      <View style={[styles.box, checked ? styles.boxOn : null]}>
        {checked ? <Ionicons name="checkmark" size={14} color={colors.onAccent} /> : null}
      </View>
      {icon ? <Ionicons name={icon} size={18} color={colors.accent} /> : null}
      <Text style={[styles.label, checked ? styles.done : null]}>{label}</Text>
      {trailing ? <Text style={styles.trail}>{trailing}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 58,
    borderRadius: radius.row,
    backgroundColor: colors.surface,
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingHorizontal: space.md,
    gap: 10,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  label: { flex: 1, ...rtlText, color: colors.text, fontSize: 15, fontWeight: "500" },
  done: { color: colors.textMuted },
  trail: { color: colors.textMuted, fontSize: 13 },
});
