import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { HomeV4Icon } from "../home-v4/homeV4Icons";
import { CHAT, heebo } from "./chatV4Theme";

export function ChatV4Composer({
  scale,
  value,
  onChangeText,
  onSend,
  onMic,
  sending,
  recording,
}: {
  scale: number;
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  onMic: () => void;
  sending: boolean;
  recording: boolean;
}) {
  const s = scale;
  const canSend = Boolean(value.trim()) && !sending;
  return (
    <View style={[styles.row, { paddingHorizontal: 16 * s, paddingBottom: 8 * s, gap: 8 * s }]}>
      <Pressable
        onPress={onMic}
        disabled={sending}
        accessibilityLabel={recording ? "הקליטה פעילה" : "הקלטה"}
        accessibilityState={{ busy: recording, disabled: sending }}
        style={{
          width: 48 * s,
          height: 48 * s,
          borderRadius: 24 * s,
          backgroundColor: recording ? CHAT.error : CHAT.mic,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <HomeV4Icon name="mic" size={20 * s} color="#FFFFFF" />
      </Pressable>
      <View
        style={{
          flex: 1,
          minHeight: 52 * s,
          borderRadius: 28 * s,
          backgroundColor: CHAT.composer,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: CHAT.border,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14 * s,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={recording ? "מקליטה…" : "כתבו לי כל מה שתרצו..."}
          placeholderTextColor={CHAT.muted}
          style={{
            flex: 1,
            fontFamily: heebo("400"),
            fontSize: 14 * s,
            lineHeight: 20 * s,
            color: CHAT.text,
            textAlign: "right",
            paddingVertical: 12 * s,
          }}
          editable={!sending && !recording}
          returnKeyType="send"
          onSubmitEditing={() => {
            if (canSend) onSend();
          }}
          blurOnSubmit={false}
        />
        {canSend ? (
          <Pressable onPress={onSend} accessibilityLabel="שלח" style={{ padding: 6 * s }}>
            <Ionicons name="paper-plane-outline" size={Math.round(18 * s)} color={CHAT.sage} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
});
