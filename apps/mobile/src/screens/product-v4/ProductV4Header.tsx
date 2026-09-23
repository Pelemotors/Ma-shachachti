import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { HomeV4Icon } from "../home-v4/homeV4Icons";
import { heebo, V4 } from "../home-v4/homeV4Theme";

const FALLBACK = require("../../../assets/home-v4/avatar-fallback.png");

export function ProductV4Header({
  scale,
  title,
  subtitle,
  avatarUrl,
  unread,
  onBell,
  onBack,
}: {
  scale: number;
  title: string;
  subtitle: string;
  avatarUrl: string | null;
  unread: boolean;
  onBell: () => void;
  onBack?: () => void;
}) {
  const s = scale;
  return (
    <View style={[styles.row, { paddingHorizontal: 16 * s, minHeight: 80 * s }]}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityLabel="חזרה"
          style={[styles.circle, { width: 40 * s, height: 40 * s, borderRadius: 20 * s }]}
        >
          <HomeV4Icon name="chevron" size={18 * s} color={V4.text} />
        </Pressable>
      ) : (
        <Pressable
          onPress={onBell}
          accessibilityLabel="התראות"
          style={[styles.circle, { width: 40 * s, height: 40 * s, borderRadius: 20 * s }]}
        >
          <HomeV4Icon name="bell" size={20 * s} color={V4.text} />
          {unread ? (
            <View
              style={[
                styles.dot,
                { width: 8 * s, height: 8 * s, borderRadius: 4 * s, top: 6 * s, right: 8 * s },
              ]}
            />
          ) : null}
        </Pressable>
      )}
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
          {title}
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
          {subtitle}
        </Text>
      </View>
      <Image
        source={avatarUrl ? { uri: avatarUrl } : FALLBACK}
        style={{
          width: 40 * s,
          height: 40 * s,
          borderRadius: 20 * s,
          backgroundColor: "#E8E4DC",
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  center: { flex: 1, paddingHorizontal: 8 },
  circle: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: V4.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: V4.border,
  },
  dot: { position: "absolute", backgroundColor: V4.dot },
});
