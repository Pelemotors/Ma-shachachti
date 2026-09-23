import { Image, StyleSheet, View } from "react-native";

// From src/components → apps/mobile/assets (two levels up).
const FALLBACK = require("../../assets/home-v4/avatar-fallback.png");

type Size = "entity" | "household" | "settings" | "profile";

const PX: Record<Size, number> = {
  entity: 24,
  household: 44,
  settings: 52,
  profile: 112,
};

export function UserAvatar({
  uri,
  size = "settings",
  accessibilityLabel,
}: {
  uri?: string | null;
  size?: Size;
  accessibilityLabel?: string;
}) {
  const dim = PX[size];
  return (
    <View
      accessibilityLabel={accessibilityLabel ?? "אווטאר"}
      style={[
        styles.wrap,
        {
          width: dim,
          height: dim,
          borderRadius: dim / 2,
        },
      ]}
    >
      <Image
        source={uri ? { uri } : FALLBACK}
        style={{ width: dim, height: dim, borderRadius: dim / 2 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    backgroundColor: "#E8E4DC",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
});
