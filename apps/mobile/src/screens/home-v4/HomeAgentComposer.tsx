import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { HomeV4Icon } from "./homeV4Icons";
import { heebo, V4 } from "./homeV4Theme";

export function HomeAgentComposer({
  scale,
  value,
  onChangeText,
  onSend,
  onMic,
  sending,
  recording,
  error,
}: {
  scale: number;
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  onMic: () => void;
  sending: boolean;
  recording: boolean;
  error: string;
}) {
  const s = scale;
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {error ? (
        <Pressable onPress={onSend} style={{ alignSelf: "flex-end", marginBottom: 4 * s }}>
          <Text style={{ fontFamily: heebo("500"), fontSize: 11 * s, color: "#8B2E1F" }}>
            {error} · נסי שוב
          </Text>
        </Pressable>
      ) : null}
      <View
        style={{
          height: 48 * s,
          borderRadius: 24 * s,
          borderColor: focused ? V4.sageSoft : V4.border,
          backgroundColor: V4.composer,
          borderWidth: StyleSheet.hairlineWidth,
          flexDirection: "row-reverse",
          alignItems: "center",
          paddingHorizontal: 6 * s,
          shadowColor: V4.shadow,
          shadowOpacity: 0.22,
          shadowRadius: 10 * s,
          shadowOffset: { width: 0, height: 3 * s },
          elevation: 4,
        }}
      >
        <Pressable
          onPress={onMic}
          accessibilityRole="button"
          accessibilityLabel={recording ? "עצור הקלטה" : "הקלטה"}
          style={{
            width: 36 * s,
            height: 36 * s,
            borderRadius: 18 * s,
            backgroundColor: recording ? "#C45C4A" : "#A9674F",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <HomeV4Icon name="mic" size={18 * s} color="#FFFFFF" />
        </Pressable>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="כתבי או הקליטי משהו..."
          placeholderTextColor={V4.placeholder}
          style={{ flex: 1, fontFamily: heebo("400"), fontSize: 13 * s, color: V4.text, textAlign: "right", paddingHorizontal: 10 * s }}
          textAlign="right"
          returnKeyType="send"
          onSubmitEditing={onSend}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={!sending}
        />
        <View style={{ width: StyleSheet.hairlineWidth, height: 26 * s, backgroundColor: V4.border }} />
        <Pressable onPress={onSend} accessibilityRole="button" accessibilityLabel="שלח" style={{ paddingHorizontal: 8 * s }}>
          <HomeV4Icon name="send" size={18 * s} color={V4.text} />
        </Pressable>
        {sending ? <ActivityIndicator color={V4.sage} style={{ marginEnd: 8 * s }} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
});
