import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { heebo, V4 } from "./homeV4Theme";

const WAVEFORM = require("../../../assets/home-master/decor/bank-waveform.png");

export function HomeBankButton({ scale, onPress }: { scale: number; onPress: () => void }) {
  const s = scale;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="הקלט לבנק"
      style={[
        styles.button,
        {
          height: 44 * s,
          borderRadius: 22 * s,
          paddingHorizontal: 18 * s,
          width: 190 * s,
          minWidth: 190 * s,
          alignSelf: "center",
          borderWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 * s }}>
        <Image source={WAVEFORM} resizeMode="contain" style={{ width: 52 * s, height: 34 * s }} />
        <Text style={{ fontFamily: heebo("500"), fontSize: 14 * s, color: V4.text }}>הקלט לבנק</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4E1DB",
    borderColor: "rgba(169,103,79,0.28)",
  },
});
