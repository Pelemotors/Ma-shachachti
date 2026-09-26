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
          marginHorizontal: 16 * s,
          borderWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      <Image source={WAVEFORM} resizeMode="contain" style={{ width: 52 * s, height: 34 * s }} />
      <Text style={{ fontFamily: heebo("500"), fontSize: 15 * s, color: V4.text }}>הקלט לבנק</Text>
      <View style={{ width: 52 * s }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,253,249,0.82)",
    borderColor: "rgba(169,103,79,0.2)",
  },
});
