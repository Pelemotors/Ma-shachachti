import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { ReactNode } from "react";

export function ScreenShell({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="חזרה"
            style={styles.backHit}
          >
            <Text style={styles.back}>חזרה</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}

export function Field(props: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  hint?: string;
  secure?: boolean;
  multiline?: boolean;
}) {
  return (
    <TextInput
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.hint ?? props.placeholder}
      placeholderTextColor="#A08978"
      secureTextEntry={props.secure}
      multiline={props.multiline}
      textAlign="right"
      style={[styles.input, props.multiline ? styles.multiline : null]}
    />
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      style={[styles.btn, danger ? styles.danger : null, disabled ? styles.disabled : null]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

export function ErrorText({ message }: { message: string }) {
  if (!message) return null;
  return <Text style={styles.error}>{message}</Text>;
}

export function Hint({ children }: { children: ReactNode }) {
  return <Text style={styles.hint}>{children}</Text>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#F7F1EA" },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 22, fontWeight: "700", color: "#3D2B1F", textAlign: "right" },
  backHit: {
    minWidth: 48,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  back: { color: "#8B5E3C", fontWeight: "600" },
  body: { padding: 20, gap: 10, paddingBottom: 40 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    fontSize: 16,
    color: "#3D2B1F",
  },
  multiline: { minHeight: 96, textAlignVertical: "top", paddingTop: 12 },
  btn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#8B5E3C",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  danger: { backgroundColor: "#8B2E1F" },
  disabled: { opacity: 0.45 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: "#8B2E1F", textAlign: "right" },
  hint: { color: "#8A7464", textAlign: "right", lineHeight: 22 },
});
