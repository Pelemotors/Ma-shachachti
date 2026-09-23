import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { HomeV4Icon } from "../home-v4/homeV4Icons";
import { CHAT, heebo } from "./chatV4Theme";

const FALLBACK = require("../../../assets/home-v4/avatar-fallback.png");

export function ChatV4Header({
  scale,
  avatarUrl,
  unread,
  onBell,
  onAvatar,
  onHistory,
}: {
  scale: number;
  avatarUrl: string | null;
  unread: boolean;
  onBell: () => void;
  onAvatar: () => void;
  onHistory: () => void;
}) {
  const s = scale;
  return (
    <View style={[styles.row, { paddingHorizontal: 16 * s, minHeight: 80 * s }]}>
      <Pressable
        onPress={onBell}
        accessibilityLabel="התראות"
        style={[
          styles.circle,
          { width: 40 * s, height: 40 * s, borderRadius: 20 * s },
        ]}
      >
        <HomeV4Icon name="bell" size={20 * s} color={CHAT.text} />
        {unread ? (
          <View
            style={{
              position: "absolute",
              width: 8 * s,
              height: 8 * s,
              borderRadius: 4 * s,
              backgroundColor: CHAT.dot,
              top: 6 * s,
              right: 8 * s,
            }}
          />
        ) : null}
      </Pressable>
      <View style={styles.center}>
        <Text
          style={{
            fontFamily: heebo("700"),
            fontSize: 24 * s,
            lineHeight: 30 * s,
            color: CHAT.title,
            textAlign: "center",
          }}
        >
          שיחה
        </Text>
        <Text
          style={{
            fontFamily: heebo("400"),
            fontSize: 13 * s,
            lineHeight: 18 * s,
            color: CHAT.muted,
            textAlign: "center",
            marginTop: 2 * s,
          }}
        >
          כאן אני תמיד בשבילך
        </Text>
      </View>
      <View style={styles.end}>
        <Pressable
          onPress={onHistory}
          accessibilityLabel="שיחות"
          style={[
            styles.circle,
            { width: 40 * s, height: 40 * s, borderRadius: 20 * s },
          ]}
        >
          <HomeV4Icon name="chat" size={20 * s} color={CHAT.text} />
        </Pressable>
        <Pressable onPress={onAvatar} accessibilityLabel="חשבון">
          <Image
            source={avatarUrl ? { uri: avatarUrl } : FALLBACK}
            style={{
              width: 40 * s,
              height: 40 * s,
              borderRadius: 20 * s,
              backgroundColor: "#E8E4DC",
            }}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  center: { flex: 1, paddingHorizontal: 8 },
  end: { flexDirection: "row", alignItems: "center", gap: 8 },
  circle: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CHAT.agentBubble,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CHAT.border,
  },
});
