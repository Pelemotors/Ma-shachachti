import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radius, rtlText, space } from "../../theme";

export function CategoryTile({
  title,
  icon,
  onPress,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.tile}>
      <Ionicons name={icon} size={26} color={colors.accent} />
      <Text style={styles.title}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 108,
    borderRadius: radius.tile,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    padding: space.md,
  },
  title: { ...rtlText, textAlign: "center", color: colors.text, fontSize: 14, fontWeight: "600" },
});
