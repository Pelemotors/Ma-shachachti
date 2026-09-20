import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radius, rtlText, type } from "../../theme";

export function PrimaryActionButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.btn, disabled ? styles.disabled : null]}
    >
      <Text style={[styles.label, disabled ? styles.disabledLabel : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  disabled: { backgroundColor: colors.disabled },
  label: { ...type.cta, ...rtlText, textAlign: "center" },
  disabledLabel: { color: colors.disabledText },
});
