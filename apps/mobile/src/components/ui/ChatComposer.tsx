import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, rtlText } from "../../theme";

export function ChatComposer({
  value,
  onChangeText,
  onSend,
  placeholder = "אפשר לכתוב כאן...",
  homeLock = false,
  scale = 1,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  homeLock?: boolean;
  scale?: number;
}) {
  const s = scale;
  return (
    <View
      style={[
        styles.wrap,
        homeLock
          ? {
              borderRadius: 28 * s,
              backgroundColor: "#FFFDFC",
              borderColor: "#E8D7CB",
              paddingHorizontal: 8 * s,
            }
          : null,
      ]}
    >
      <Pressable onPress={onSend} style={[styles.send, homeLock ? { minWidth: 56 * s, height: 40 * s, gap: 4 * s } : null]} accessibilityLabel="שלח">
        <Ionicons name="paper-plane-outline" size={Math.round(16 * s)} color={homeLock ? "#A66B59" : colors.accent} />
        <Text style={[styles.sendLabel, homeLock ? { fontSize: 14 * s, color: "#A66B59" } : null]}>שלח</Text>
      </Pressable>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={homeLock ? "#8A7970" : colors.textMuted}
        style={[styles.input, homeLock ? { fontSize: 14 * s, color: "#342B28" } : null]}
        textAlign="right"
        returnKeyType="send"
        onSubmitEditing={onSend}
      />
      <Pressable
        onPress={onSend}
        style={[
          styles.mic,
          homeLock
            ? {
                width: 40 * s,
                height: 40 * s,
                borderRadius: 20 * s,
                backgroundColor: "transparent",
              }
            : null,
        ]}
        accessibilityLabel="הקלטה"
      >
        <Ionicons name="mic-outline" size={Math.round(18 * s)} color={homeLock ? "#A66B59" : colors.accent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: "100%",
    minHeight: 36,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  input: {
    flex: 1,
    ...rtlText,
    color: colors.text,
    fontSize: 13,
    height: "100%",
    paddingHorizontal: 6,
  },
  send: {
    minWidth: 56,
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  sendLabel: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  mic: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7F1EA",
  },
});
