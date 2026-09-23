import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { HomeV4Icon } from "./homeV4Icons";
import { heebo, V4 } from "./homeV4Theme";

const FALLBACK = require("../../../assets/home-v4/avatar-fallback.png");

export function HomeHeader({
  scale,
  greeting,
  avatarUrl,
  unread,
  onBell,
  onAvatar,
}: {
  scale: number;
  greeting: string;
  avatarUrl: string | null;
  unread: boolean;
  onBell: () => void;
  onAvatar: () => void;
}) {
  const s = scale;
  return (
    <View style={[styles.row, { paddingHorizontal: 16 * s, minHeight: 80 * s }]}>
      <Pressable
        onPress={onBell}
        accessibilityLabel="התראות"
        style={[
          styles.bell,
          {
            width: 40 * s,
            height: 40 * s,
            borderRadius: 20 * s,
            borderWidth: StyleSheet.hairlineWidth,
          },
        ]}
      >
        <HomeV4Icon name="bell" size={20 * s} color={V4.text} />
        {unread ? (
          <View
            style={[
              styles.dot,
              {
                width: 8 * s,
                height: 8 * s,
                borderRadius: 4 * s,
                top: 6 * s,
                right: 8 * s,
              },
            ]}
          />
        ) : null}
      </Pressable>
      <View style={styles.center}>
        <Text
          style={{
            fontFamily: heebo("700"),
            fontSize: 22 * s,
            lineHeight: 28 * s,
            color: V4.text,
            textAlign: "center",
          }}
        >
          {greeting}
        </Text>
        <Text
          style={{
            fontFamily: heebo("400"),
            fontSize: 13 * s,
            lineHeight: 18 * s,
            color: V4.muted,
            textAlign: "center",
            marginTop: 2 * s,
          }}
        >
          בואי נעשה סדר בראש
        </Text>
      </View>
      <Pressable onPress={onAvatar} accessibilityLabel="הגדרות ופרופיל">
        <Image
          source={avatarUrl ? { uri: avatarUrl } : FALLBACK}
          style={{
            width: Math.max(40 * s, 44),
            height: Math.max(40 * s, 44),
            borderRadius: Math.max(40 * s, 44) / 2,
            backgroundColor: "#E8E4DC",
            overflow: "hidden",
          }}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bell: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: V4.card,
    borderColor: V4.border,
  },
  center: { flex: 1, paddingHorizontal: 8 },
  dot: { position: "absolute", backgroundColor: V4.dot },
});
