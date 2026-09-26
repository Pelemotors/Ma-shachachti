import { Image, StyleSheet, Text, View } from "react-native";
import { heebo, V4 } from "./homeV4Theme";

const TAGLINE_SPRIG = require("../../../assets/home-master-v2/header-sprig-master-v2.png");

export function HomeHeader({
  scale,
  greeting,
}: {
  scale: number;
  greeting: string;
}) {
  const s = scale;
  return (
    <View style={[styles.row, { paddingHorizontal: 16 * s, minHeight: 80 * s }]}> 
      <View style={styles.side} />
      <View style={styles.center}>
        <Text style={{ fontFamily: heebo("400"), fontSize: 16 * s, lineHeight: 24 * s, color: V4.muted, textAlign: "center", marginTop: 8 * s }}>
          הבית שלך בקצב שלך
        </Text>
        <Image source={TAGLINE_SPRIG} resizeMode="contain" style={{ width: 80 * s, height: 37 * s, alignSelf: "center", marginTop: 2 * s }} />
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
      </View>
      <View style={styles.side} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  side: { width: 40 },
  center: { flex: 1, paddingHorizontal: 8 },
});
